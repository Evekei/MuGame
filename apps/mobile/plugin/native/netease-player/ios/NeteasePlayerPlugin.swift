import Capacitor
import UIKit
import WebKit

@objc(NeteasePlayerPlugin)
public class NeteasePlayerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NeteasePlayerPlugin"
    public let jsName = "NeteasePlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ensureLoggedIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadTrack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPlaybackState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "destroy", returnType: CAPPluginReturnPromise)
    ]

    private static let playerURLPrefix = "https://music.163.com/m/song?id="
    private static let audioSelector = "audio"
    private static let selectorVersion = "netease-mobile-song-audio-v1"

    private var webView: WKWebView?
    private var currentTrackId: String?
    private var lastError: String?
    private var pendingLoadCall: CAPPluginCall?

    @objc func initialize(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.ensureWebView()
            call.resolve()
        }
    }

    @objc func ensureLoggedIn(_ call: CAPPluginCall) {
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
            let loggedIn = cookies.contains { $0.name == "MUSIC_U" || $0.name == "MUSIC_A" }
            if loggedIn {
                call.resolve()
                return
            }
            call.reject("NetEase session is expired.", "netease_session_expired")
        }
    }

    @objc func loadTrack(_ call: CAPPluginCall) {
        guard let songId = call.getString("netease_song_id"), !songId.isEmpty else {
            call.reject("netease_song_id is required.", "invalid_track_id")
            return
        }

        DispatchQueue.main.async {
            self.ensureWebView()
            self.currentTrackId = songId
            self.lastError = nil
            let url = URL(string: Self.playerURLPrefix + songId)!
            self.pendingLoadCall = call
            self.webView?.load(URLRequest(url: url))
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        runPlayerAction(call, script: actionScript("play"))
    }

    @objc func pause(_ call: CAPPluginCall) {
        runPlayerAction(call, script: actionScript("pause"))
    }

    @objc func seek(_ call: CAPPluginCall) {
        let ms = call.getInt("ms")
        guard let ms, ms >= 0 else {
            call.reject("seek ms must be a non-negative integer.", "invalid_seek")
            return
        }
        runPlayerAction(call, script: seekScript(ms))
    }

    @objc func getPlaybackState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let webView = self.webView else {
                call.resolve(self.playbackState("idle", currentMs: 0, durationMs: 0))
                return
            }
            webView.evaluateJavaScript(self.stateScript()) { value, _ in
                call.resolve(self.parseState(value))
            }
        }
    }

    @objc func destroy(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.webView?.removeFromSuperview()
            self.webView = nil
            self.currentTrackId = nil
            self.lastError = nil
            self.pendingLoadCall = nil
            call.resolve()
        }
    }

    private func ensureWebView() {
        if webView != nil {
            return
        }

        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.allowsInlineMediaPlayback = true
        let playerWebView = WKWebView(frame: CGRect(x: -10, y: -10, width: 1, height: 1),
                                      configuration: configuration)
        playerWebView.navigationDelegate = self
        bridge?.viewController?.view.addSubview(playerWebView)
        webView = playerWebView
    }

    private func runPlayerAction(_ call: CAPPluginCall, script: String) {
        DispatchQueue.main.async {
            guard let webView = self.webView else {
                self.rejectUnsupported(call, reason: "player_not_initialized")
                return
            }
            webView.evaluateJavaScript(script) { value, _ in
                let result = self.parseActionResult(value)
                if result.ok {
                    call.resolve()
                    return
                }
                self.rejectUnsupported(call, reason: result.error)
            }
        }
    }

    private func rejectUnsupported(_ call: CAPPluginCall, reason: String) {
        lastError = "\(reason) selector=\(Self.audioSelector) version=\(Self.selectorVersion)"
        print("MuGameNeteasePlayer action unsupported \(lastError ?? reason)")
        call.reject(lastError ?? reason, "player_action_unsupported")
    }

    private func playbackState(_ state: String, currentMs: Int, durationMs: Int) -> [String: Any] {
        return [
            "state": state,
            "currentTimeMs": currentMs,
            "durationMs": durationMs,
            "currentTrackId": currentTrackId as Any,
            "lastError": lastError as Any
        ]
    }

    private func parseState(_ value: Any?) -> [String: Any] {
        guard let data = jsonData(value),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            lastError = "state_parse_failed selector=\(Self.audioSelector)"
            return playbackState("error", currentMs: 0, durationMs: 0)
        }
        return playbackState(json["state"] as? String ?? "error",
                             currentMs: json["currentTimeMs"] as? Int ?? 0,
                             durationMs: json["durationMs"] as? Int ?? 0)
            .merging(["lastError": json["lastError"] as Any]) { _, new in new }
    }

    private func parseActionResult(_ value: Any?) -> (ok: Bool, error: String) {
        guard let data = jsonData(value),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return (false, "action_result_parse_failed")
        }
        return (json["ok"] as? Bool ?? false, json["error"] as? String ?? "")
    }

    private func jsonData(_ value: Any?) -> Data? {
        if let string = value as? String {
            return string.data(using: .utf8)
        }
        return nil
    }

    private func actionScript(_ action: String) -> String {
        return "(function(){var a=document.querySelector('\(Self.audioSelector)');" +
            "if(!a){return JSON.stringify({ok:false,error:'audio_element_not_found'});}" +
            "try{a.\(action)();return JSON.stringify({ok:true});}" +
            "catch(e){return JSON.stringify({ok:false,error:String(e.message||e)});}})();"
    }

    private func seekScript(_ ms: Int) -> String {
        return "(function(){var a=document.querySelector('\(Self.audioSelector)');" +
            "if(!a){return JSON.stringify({ok:false,error:'audio_element_not_found'});}" +
            "a.currentTime=\(Double(ms) / 1000.0);return JSON.stringify({ok:true});})();"
    }

    private func stateScript() -> String {
        return "(function(){var a=document.querySelector('\(Self.audioSelector)');" +
            "if(!a){return JSON.stringify({state:'error',currentTimeMs:0,durationMs:0," +
            "lastError:'audio_element_not_found selector=\(Self.audioSelector) " +
            "version=\(Self.selectorVersion)'});}" +
            "var d=isFinite(a.duration)?Math.round(a.duration*1000):0;" +
            "var c=isFinite(a.currentTime)?Math.round(a.currentTime*1000):0;" +
            "var s=a.ended?'ended':(a.paused?'paused':'playing');" +
            "return JSON.stringify({state:s,currentTimeMs:c,durationMs:d,lastError:null});})();"
    }
}

extension NeteasePlayerPlugin: WKNavigationDelegate {
    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("MuGameNeteasePlayer page finished selectorVersion=\(Self.selectorVersion)")
        pendingLoadCall?.resolve()
        pendingLoadCall = nil
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        rejectPendingLoad(error)
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        rejectPendingLoad(error)
    }

    private func rejectPendingLoad(_ error: Error) {
        lastError = "player_load_failed selectorVersion=\(Self.selectorVersion) \(error.localizedDescription)"
        print("MuGameNeteasePlayer \(lastError ?? "player_load_failed")")
        pendingLoadCall?.reject(lastError ?? "Player page load failed.", "player_load_failed")
        pendingLoadCall = nil
    }
}
