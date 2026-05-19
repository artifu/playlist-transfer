import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let statusLabel = UILabel()
    private let titleLabel = UILabel()
    private let urlLabel = UILabel()
    private let openButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)

    private var playlistURL: URL?
    private var itemProviders: [NSItemProvider] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        configureView()
        configureActions()
        loadSharedPlaylistURL()
    }

    private func configureView() {
        view.backgroundColor = UIColor(red: 0.984, green: 0.984, blue: 0.992, alpha: 1)

        let mark = UIView()
        mark.translatesAutoresizingMaskIntoConstraints = false
        mark.backgroundColor = UIColor(red: 0.043, green: 0.043, blue: 0.051, alpha: 1)
        mark.layer.cornerRadius = 14
        mark.layer.cornerCurve = .continuous

        let pill = UIView()
        pill.translatesAutoresizingMaskIntoConstraints = false
        pill.backgroundColor = UIColor(red: 0.98, green: 0.78, blue: 0.80, alpha: 1)
        pill.layer.cornerRadius = 7
        pill.layer.cornerCurve = .continuous
        mark.addSubview(pill)

        let dot = UIView()
        dot.translatesAutoresizingMaskIntoConstraints = false
        dot.backgroundColor = mark.backgroundColor
        dot.layer.cornerRadius = 5
        pill.addSubview(dot)

        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.text = "Spotify playlist handoff"
        statusLabel.font = .monospacedSystemFont(ofSize: 12, weight: .bold)
        statusLabel.textColor = UIColor(red: 0.525, green: 0.525, blue: 0.545, alpha: 1)
        statusLabel.textAlignment = .center
        statusLabel.text = statusLabel.text?.uppercased()

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = "Open this playlist in PlaylistXfer?"
        titleLabel.font = .systemFont(ofSize: 28, weight: .black)
        titleLabel.textColor = UIColor(red: 0.043, green: 0.043, blue: 0.051, alpha: 1)
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0

        urlLabel.translatesAutoresizingMaskIntoConstraints = false
        urlLabel.text = "Looking for a Spotify playlist link..."
        urlLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        urlLabel.textColor = UIColor(red: 0.227, green: 0.227, blue: 0.239, alpha: 1)
        urlLabel.textAlignment = .center
        urlLabel.numberOfLines = 3

        openButton.translatesAutoresizingMaskIntoConstraints = false
        openButton.setTitle("Open in PlaylistXfer", for: .normal)
        openButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .black)
        openButton.tintColor = .white
        openButton.backgroundColor = UIColor(red: 0.98, green: 0.141, blue: 0.235, alpha: 1)
        openButton.layer.cornerRadius = 25
        openButton.layer.cornerCurve = .continuous
        openButton.isEnabled = false
        openButton.alpha = 0.45

        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .bold)
        cancelButton.tintColor = UIColor(red: 0.227, green: 0.227, blue: 0.239, alpha: 1)

        let stack = UIStackView(arrangedSubviews: [mark, statusLabel, titleLabel, urlLabel, openButton, cancelButton])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 18
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor, constant: -20),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),

            mark.widthAnchor.constraint(equalToConstant: 58),
            mark.heightAnchor.constraint(equalToConstant: 58),

            pill.centerXAnchor.constraint(equalTo: mark.centerXAnchor, constant: 3),
            pill.centerYAnchor.constraint(equalTo: mark.centerYAnchor),
            pill.widthAnchor.constraint(equalToConstant: 34),
            pill.heightAnchor.constraint(equalToConstant: 22),

            dot.leadingAnchor.constraint(equalTo: pill.leadingAnchor, constant: 6),
            dot.centerYAnchor.constraint(equalTo: pill.centerYAnchor),
            dot.widthAnchor.constraint(equalToConstant: 10),
            dot.heightAnchor.constraint(equalToConstant: 10),

            openButton.heightAnchor.constraint(equalToConstant: 50),
            openButton.leadingAnchor.constraint(equalTo: stack.leadingAnchor),
            openButton.trailingAnchor.constraint(equalTo: stack.trailingAnchor)
        ])
    }

    private func configureActions() {
        openButton.addTarget(self, action: #selector(openPlaylist), for: .touchUpInside)
        cancelButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
    }

    private func loadSharedPlaylistURL() {
        itemProviders = extensionContext?.inputItems
            .compactMap { $0 as? NSExtensionItem }
            .flatMap { $0.attachments ?? [] } ?? []

        loadPlaylistURL(at: 0)
    }

    private func loadPlaylistURL(at index: Int) {
        guard index < itemProviders.count else {
            updateForMissingPlaylist()
            return
        }

        let provider = itemProviders[index]

        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, _ in
                let url = Self.spotifyPlaylistURL(from: item)
                DispatchQueue.main.async {
                    if let url {
                        self?.updateForPlaylist(url)
                    } else {
                        self?.loadPlaylistURL(at: index + 1)
                    }
                }
            }
            return
        }

        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] item, _ in
                let url = Self.spotifyPlaylistURL(from: item)
                DispatchQueue.main.async {
                    if let url {
                        self?.updateForPlaylist(url)
                    } else {
                        self?.loadPlaylistURL(at: index + 1)
                    }
                }
            }
            return
        }

        loadPlaylistURL(at: index + 1)
    }

    private func updateForPlaylist(_ url: URL) {
        playlistURL = url
        urlLabel.text = url.absoluteString
        openButton.isEnabled = true
        openButton.alpha = 1
    }

    private func updateForMissingPlaylist() {
        titleLabel.text = "No Spotify playlist link found"
        urlLabel.text = "Share a public Spotify playlist URL to send it into PlaylistXfer."
        openButton.isEnabled = false
        openButton.alpha = 0.45
    }

    @objc private func openPlaylist() {
        guard let playlistURL, let deepLink = deepLinkURL(for: playlistURL) else {
            updateForMissingPlaylist()
            return
        }

        extensionContext?.open(deepLink) { [weak self] _ in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }

    @objc private func cancel() {
        extensionContext?.cancelRequest(withError: ShareExtensionError.cancelled)
    }

    private func deepLinkURL(for playlistURL: URL) -> URL? {
        var components = URLComponents()
        components.scheme = "playlistxfer"
        components.host = "import"
        components.queryItems = [
            URLQueryItem(name: "url", value: playlistURL.absoluteString)
        ]
        return components.url
    }

    nonisolated private static func spotifyPlaylistURL(from item: NSSecureCoding?) -> URL? {
        if let url = item as? URL, isSupportedSpotifyPlaylistURL(url) {
            return url
        }

        if let url = item as? NSURL, let swiftURL = url as URL?, isSupportedSpotifyPlaylistURL(swiftURL) {
            return swiftURL
        }

        if let text = item as? String {
            return firstSpotifyPlaylistURL(in: text)
        }

        if let text = item as? NSString {
            return firstSpotifyPlaylistURL(in: text as String)
        }

        return nil
    }

    nonisolated private static func firstSpotifyPlaylistURL(in text: String) -> URL? {
        if let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
           isSupportedSpotifyPlaylistURL(url) {
            return url
        }

        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return detector?
            .matches(in: text, options: [], range: range)
            .compactMap(\.url)
            .first(where: isSupportedSpotifyPlaylistURL)
    }

    nonisolated private static func isSupportedSpotifyPlaylistURL(_ url: URL) -> Bool {
        let absolute = url.absoluteString.lowercased()
        return absolute.contains("open.spotify.com/playlist/")
            || absolute.contains("spotify.link/")
    }
}

private enum ShareExtensionError: LocalizedError {
    case cancelled

    var errorDescription: String? {
        "PlaylistXfer share extension was cancelled."
    }
}
