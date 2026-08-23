import Capacitor
import UIKit
import WebKit

@objc(NeteaseAuthPlugin)
public class NeteaseAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NeteaseAuthPlugin"
    public let jsName = "NeteaseAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openLogin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeLogin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise)
    ]

    private var loginController: NeteaseLoginViewController?
    private var pendingLoginCall: CAPPluginCall?

    @objc func openLogin(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingLoginCall == nil else {
                call.reject("NetEase login is already open.", "login_already_open")
                return
            }

            let controller = NeteaseLoginViewController()
            controller.onAuthenticated = { [weak self] in
                self?.resolvePendingLogin()
            }
            controller.onCancelled = { [weak self] in
                self?.cancelPendingLogin()
            }

            self.pendingLoginCall = call
            self.loginController = controller
            self.bridge?.viewController?.present(controller, animated: true)
        }
    }

    @objc func closeLogin(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.dismissLoginController()
            call.resolve()
        }
    }

    @objc func readSession(_ call: CAPPluginCall) {
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
            let snapshot = self.cookieSnapshot(from: cookies)
            guard !snapshot.isEmpty else {
                call.reject("NetEase session is not available.", "session_unavailable")
                return
            }

            call.resolve([
                "cookies": snapshot,
                "captured_at": Self.utcNow()
            ])
        }
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.dismissLoginController()
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
                let group = DispatchGroup()
                for cookie in cookies where Self.isNeteaseCookie(cookie) {
                    group.enter()
                    WKWebsiteDataStore.default().httpCookieStore.delete(cookie) {
                        group.leave()
                    }
                }
                group.notify(queue: .main) {
                    call.resolve()
                }
            }
        }
    }

    private func resolvePendingLogin() {
        guard let call = pendingLoginCall else {
            return
        }

        pendingLoginCall = nil
        call.resolve(["authenticated": true])
        dismissLoginController()
    }

    private func cancelPendingLogin() {
        pendingLoginCall?.reject("NetEase login cancelled.", "login_cancelled")
        pendingLoginCall = nil
        dismissLoginController()
    }

    private func dismissLoginController() {
        loginController?.dismiss(animated: true)
        loginController = nil
    }

    private func cookieSnapshot(from cookies: [HTTPCookie]) -> [[String: String]] {
        return cookies
            .filter { Self.isAllowedCookie($0) }
            .map {
                [
                    "name": $0.name,
                    "value": $0.value,
                    "domain": $0.domain,
                    "path": $0.path
                ]
            }
    }

    private static func isAllowedCookie(_ cookie: HTTPCookie) -> Bool {
        let allowed = ["MUSIC_U", "MUSIC_A", "MUSIC_R_T", "MUSIC_R_I", "__csrf", "NMTID"]
        return isNeteaseCookie(cookie) && allowed.contains(cookie.name)
    }

    private static func isNeteaseCookie(_ cookie: HTTPCookie) -> Bool {
        return cookie.domain.contains("music.163.com")
    }

    private static func utcNow() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: Date())
    }
}

private final class NeteaseLoginViewController: UIViewController, WKNavigationDelegate {
    var onAuthenticated: (() -> Void)?
    var onCancelled: (() -> Void)?

    private let webView = WKWebView(frame: .zero)

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .systemBackground
        webView.navigationDelegate = self
        layoutChrome()
        webView.load(URLRequest(url: URL(string: "https://music.163.com/")!))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
            if cookies.contains(where: { $0.name == "MUSIC_U" || $0.name == "MUSIC_A" }) {
                DispatchQueue.main.async {
                    self.onAuthenticated?()
                }
            }
        }
    }

    private func layoutChrome() {
        let closeButton = UIButton(type: .system)
        closeButton.setTitle("Close", for: .normal)
        closeButton.addTarget(self, action: #selector(cancelLogin), for: .touchUpInside)

        closeButton.translatesAutoresizingMaskIntoConstraints = false
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(closeButton)
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            closeButton.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            closeButton.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            closeButton.heightAnchor.constraint(equalToConstant: 48),
            webView.topAnchor.constraint(equalTo: closeButton.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    @objc private func cancelLogin() {
        onCancelled?()
    }
}
