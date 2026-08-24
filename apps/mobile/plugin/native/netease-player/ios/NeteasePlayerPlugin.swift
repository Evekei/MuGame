import Capacitor
import UIKit

@objc(NeteasePlayerPlugin)
public class NeteasePlayerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NeteasePlayerPlugin"
    public let jsName = "NeteasePlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ensureLoggedIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadPlaylist", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadTrack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "next", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "previous", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPlaybackState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "destroy", returnType: CAPPluginReturnPromise)
    ]

    private static let playlistURLPrefix = "https://music.163.com/playlist?id="
    private static let songURLPrefix = "https://music.163.com/song?id="

    private var currentTrackId: String?
    private var preparedURL: URL?
    private var externalOpened = false
    private var lastError: String?

    @objc func initialize(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func ensureLoggedIn(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func loadTrack(_ call: CAPPluginCall) {
        guard let songId = call.getString("netease_song_id"), !songId.isEmpty else {
            call.reject("netease_song_id is required.", "invalid_track_id")
            return
        }
        currentTrackId = songId
        prepareURL(Self.songURLPrefix + songId)
        call.resolve()
    }

    @objc func loadPlaylist(_ call: CAPPluginCall) {
        guard let playlistId = call.getString("netease_playlist_id"), !playlistId.isEmpty else {
            call.reject("netease_playlist_id is required.", "invalid_playlist_id")
            return
        }
        currentTrackId = nil
        prepareURL(Self.playlistURLPrefix + playlistId)
        call.resolve()
    }

    @objc func play(_ call: CAPPluginCall) {
        guard let preparedURL else {
            call.reject("No NetEase playlist or song is prepared.", "player_not_initialized")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(preparedURL) { opened in
                if opened {
                    self.externalOpened = true
                    self.lastError = nil
                    call.resolve()
                    return
                }
                self.lastError = "netease_app_open_failed"
                call.reject("NetEase app could not be opened.", "netease_app_open_failed")
            }
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        rejectExternalControl(call)
    }

    @objc func next(_ call: CAPPluginCall) {
        rejectExternalControl(call)
    }

    @objc func previous(_ call: CAPPluginCall) {
        rejectExternalControl(call)
    }

    @objc func seek(_ call: CAPPluginCall) {
        call.reject("Seek is not available when playback is handled by NetEase app.",
                    "player_action_unsupported")
    }

    @objc func getPlaybackState(_ call: CAPPluginCall) {
        if externalOpened {
            call.resolve(playbackState("playing"))
            return
        }
        if preparedURL != nil {
            call.resolve(playbackState("paused"))
            return
        }
        call.resolve(playbackState("idle"))
    }

    @objc func destroy(_ call: CAPPluginCall) {
        currentTrackId = nil
        preparedURL = nil
        externalOpened = false
        lastError = nil
        call.resolve()
    }

    private func prepareURL(_ value: String) {
        preparedURL = URL(string: value)
        externalOpened = false
        lastError = nil
    }

    private func rejectExternalControl(_ call: CAPPluginCall) {
        call.reject("Transport controls are not available in external NetEase app mode.",
                    "player_action_unsupported")
    }

    private func playbackState(_ state: String) -> [String: Any] {
        return [
            "state": state,
            "currentTimeMs": 0,
            "durationMs": 0,
            "currentTrackId": currentTrackId as Any,
            "lastError": lastError as Any
        ]
    }
}
