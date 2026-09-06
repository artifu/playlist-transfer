import Foundation

enum SpotifyLocalIngestionError: LocalizedError, Sendable {
    case invalidInput
    case unsupportedResource
    case redirectFailed
    case requestFailed(Int)
    case missingAnonymousToken
    case incompletePlaylist(expected: Int, received: Int)
    case malformedResponse

    var errorDescription: String? {
        switch self {
        case .invalidInput:
            return "Paste or share a Spotify playlist or song link."
        case .unsupportedResource:
            return "This Spotify link is not a playlist or song. Share a playlist or an individual song instead."
        case .redirectFailed:
            return "PlaylistXfer could not resolve that shortened Spotify link."
        case .requestFailed(let status):
            return "Spotify's public service returned status \(status)."
        case .missingAnonymousToken:
            return "Spotify did not provide a public session for this link."
        case .incompletePlaylist(let expected, let received):
            return "Spotify returned only \(received) of \(expected) readable tracks."
        case .malformedResponse:
            return "Spotify returned an unreadable public response."
        }
    }
}

actor SpotifyLocalIngestionService {
    typealias Progress = @MainActor @Sendable (_ completed: Int, _ total: Int) -> Void

    private struct SpotifyResource: Sendable {
        enum Kind: String, Sendable {
            case playlist
            case track
        }

        let kind: Kind
        let id: String
    }

    private struct PlaylistEnvelope: Decodable {
        struct Contents: Decodable {
            struct Item: Decodable {
                let uri: String?
            }

            let items: [Item]
        }

        let length: Int?
        let contents: Contents
    }

    private struct EmbedPayload: Decodable {
        struct Props: Decodable {
            struct PageProps: Decodable {
                struct State: Decodable {
                    struct DataEnvelope: Decodable {
                        let entity: Entity
                    }

                    let data: DataEnvelope
                }

                let state: State
            }

            let pageProps: PageProps
        }

        struct Entity: Decodable {
            struct CoverArt: Decodable {
                struct Source: Decodable {
                    let url: URL?
                }

                let sources: [Source]
            }

            struct Track: Decodable {
                let uri: String
                let title: String
                let subtitle: String?
                let duration: Int?
            }

            let name: String?
            let title: String?
            let subtitle: String?
            let uri: String
            let duration: Int?
            let coverArt: CoverArt?
            let trackList: [Track]?
        }

        let props: Props

        var entity: Entity { props.pageProps.state.data.entity }
    }

    private static let spotifyIDPattern = #"^[A-Za-z0-9]{22}$"#
    private static let spotifyURIPattern = #"spotify:(playlist|track):([A-Za-z0-9]{22})"#
    private static let spotifyURLPattern = #"https?://[^\s<>\"']+"#
    private static let redirectHosts = Set(["spotify.link", "spotify.app.link"])
    private static let limitations = [
        "Read locally from Spotify public embed metadata without Spotify OAuth",
        "Duplicate Spotify track IDs are removed before transfer",
        "Spotify may change this public web surface"
    ]

    private let session: URLSession
    private var cache: [String: PlaylistPreviewResponse] = [:]

    init(session: URLSession = .shared) {
        self.session = session
    }

    func preview(input: String, progress: Progress? = nil) async throws -> PlaylistPreviewResponse {
        let resource = try await resolveResource(input)
        let cacheKey = "\(resource.kind.rawValue):\(resource.id)"
        if let cached = cache[cacheKey] {
            await progress?(cached.tracks.count, cached.tracks.count)
            return cached
        }

        let response: PlaylistPreviewResponse
        switch resource.kind {
        case .playlist:
            response = try await fetchPlaylist(resource.id, progress: progress)
        case .track:
            response = try await fetchTrack(resource.id, progress: progress)
        }

        cache[cacheKey] = response
        return response
    }

    private func resolveResource(_ input: String) async throws -> SpotifyResource {
        let candidate = Self.inputCandidate(input)
        if let parsed = Self.parseResource(candidate) {
            return parsed
        }

        guard let url = URL(string: candidate),
              let host = url.host?.lowercased(),
              Self.redirectHosts.contains(host) else {
            if candidate.localizedCaseInsensitiveContains("spotify") {
                throw SpotifyLocalIngestionError.unsupportedResource
            }
            throw SpotifyLocalIngestionError.invalidInput
        }

        var request = Self.request(url: url, timeout: 15)
        request.httpMethod = "GET"
        let (_, response) = try await session.data(for: request)
        guard let finalURL = response.url,
              let parsed = Self.parseResource(finalURL.absoluteString) else {
            throw SpotifyLocalIngestionError.redirectFailed
        }
        return parsed
    }

    private func fetchPlaylist(_ playlistID: String, progress: Progress?) async throws -> PlaylistPreviewResponse {
        let embedURL = URL(string: "https://open.spotify.com/embed/playlist/\(playlistID)")!
        let embedHTML = try await fetchText(embedURL)
        guard let token = Self.embedAccessToken(embedHTML) else {
            throw SpotifyLocalIngestionError.missingAnonymousToken
        }
        guard let entity = Self.embedEntity(embedHTML),
              let embeddedTracks = entity.trackList else {
            throw SpotifyLocalIngestionError.malformedResponse
        }

        let playlistURL = URL(string: "https://spclient.wg.spotify.com/playlist/v2/playlist/\(playlistID)?format=json")!
        let playlistData = try await fetchData(playlistURL, bearerToken: token)
        guard let envelope = try? JSONDecoder().decode(PlaylistEnvelope.self, from: playlistData) else {
            throw SpotifyLocalIngestionError.malformedResponse
        }

        let trackIDs = Self.uniqueTrackIDs(envelope.contents.items.compactMap(\.uri))
        guard !trackIDs.isEmpty else {
            throw SpotifyLocalIngestionError.incompletePlaylist(
                expected: envelope.length ?? envelope.contents.items.count,
                received: 0
            )
        }

        let tracks = Self.spotifyTracks(from: embeddedTracks)
        let embeddedIDs = tracks.compactMap(\.spotifyTrackId)
        guard tracks.count == trackIDs.count,
              Set(embeddedIDs) == Set(trackIDs) else {
            throw SpotifyLocalIngestionError.incompletePlaylist(
                expected: trackIDs.count,
                received: tracks.count
            )
        }
        await progress?(tracks.count, tracks.count)

        return PlaylistPreviewResponse(
            playlist: SpotifyPlaylist(
                id: playlistID,
                name: entity.name ?? entity.title ?? "Spotify playlist",
                kind: "playlist",
                description: "Read directly on this iPhone from Spotify public metadata.",
                imageUrl: entity.coverArt?.sources.first?.url,
                totalItems: tracks.count,
                source: "spotify-local-embed-verified",
                limitations: Self.limitations
            ),
            tracks: tracks
        )
    }

    private func fetchTrack(_ trackID: String, progress: Progress?) async throws -> PlaylistPreviewResponse {
        let embedURL = URL(string: "https://open.spotify.com/embed/track/\(trackID)")!
        let embedHTML = try await fetchText(embedURL)
        guard let entity = Self.embedEntity(embedHTML),
              let parsedID = Self.trackID(from: entity.uri),
              parsedID == trackID else {
            throw SpotifyLocalIngestionError.malformedResponse
        }
        let track = SpotifyTrack(
            spotifyTrackId: trackID,
            isrc: nil,
            name: entity.title ?? entity.name ?? "Spotify song",
            artists: Self.artistNames(entity.subtitle),
            album: nil,
            albumImageUrl: entity.coverArt?.sources.first?.url,
            durationMs: entity.duration
        )
        await progress?(1, 1)

        return PlaylistPreviewResponse(
            playlist: SpotifyPlaylist(
                id: trackID,
                name: track.name,
                kind: "track",
                description: "Read directly on this iPhone from Spotify public metadata.",
                imageUrl: track.albumImageUrl,
                totalItems: 1,
                source: "spotify-local-track",
                limitations: Self.limitations
            ),
            tracks: [track]
        )
    }

    private func fetchText(_ url: URL) async throws -> String {
        let data = try await fetchData(url)
        guard let value = String(data: data, encoding: .utf8) else {
            throw SpotifyLocalIngestionError.malformedResponse
        }
        return value
    }

    private func fetchData(_ url: URL, bearerToken: String? = nil) async throws -> Data {
        try await Self.fetchData(url, bearerToken: bearerToken, session: session)
    }

    private static func fetchData(
        _ url: URL,
        bearerToken: String? = nil,
        session: URLSession
    ) async throws -> Data {
        var request = request(url: url, timeout: 20)
        if let bearerToken {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
        }

        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw SpotifyLocalIngestionError.requestFailed(status)
        }
        return data
    }

    private static func request(url: URL, timeout: TimeInterval) -> URLRequest {
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.setValue(
            "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.7",
            forHTTPHeaderField: "Accept"
        )
        request.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")
        request.setValue(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
            forHTTPHeaderField: "User-Agent"
        )
        return request
    }

    private static func inputCandidate(_ input: String) -> String {
        let invisibleScalars = Set<Unicode.Scalar>(["\u{200B}", "\u{200C}", "\u{200D}", "\u{2060}", "\u{FEFF}"])
        let stripped = String(input.unicodeScalars.filter { !invisibleScalars.contains($0) })
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if stripped.range(of: spotifyIDPattern, options: .regularExpression) != nil {
            return stripped
        }
        if let range = stripped.range(of: spotifyURIPattern, options: [.regularExpression, .caseInsensitive]) {
            return String(stripped[range])
        }

        let matches = Self.matches(pattern: spotifyURLPattern, in: stripped)
        for match in matches {
            let candidate = match.trimmingCharacters(in: CharacterSet(charactersIn: ")]},.;!?"))
            guard let host = URL(string: candidate)?.host?.lowercased() else { continue }
            if host == "open.spotify.com" || redirectHosts.contains(host) {
                return candidate
            }
        }
        return stripped
    }

    private static func parseResource(_ input: String) -> SpotifyResource? {
        if input.range(of: spotifyIDPattern, options: .regularExpression) != nil {
            return SpotifyResource(kind: .playlist, id: input)
        }

        let uriMatches = matches(pattern: spotifyURIPattern, in: input)
        if let uri = uriMatches.first {
            let parts = uri.split(separator: ":")
            guard parts.count == 3,
                  let kind = SpotifyResource.Kind(rawValue: String(parts[1])) else { return nil }
            return SpotifyResource(kind: kind, id: String(parts[2]))
        }

        guard let url = URL(string: input), url.host?.lowercased() == "open.spotify.com" else {
            return nil
        }
        let components = url.pathComponents.filter { $0 != "/" }
        guard let kindIndex = components.firstIndex(where: { $0 == "playlist" || $0 == "track" }),
              components.indices.contains(kindIndex + 1),
              let kind = SpotifyResource.Kind(rawValue: components[kindIndex]),
              components[kindIndex + 1].range(of: spotifyIDPattern, options: .regularExpression) != nil else {
            return nil
        }
        return SpotifyResource(kind: kind, id: components[kindIndex + 1])
    }

    private static func matches(pattern: String, in input: String) -> [String] {
        guard let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
            return []
        }
        let range = NSRange(input.startIndex..<input.endIndex, in: input)
        return expression.matches(in: input, range: range).compactMap { match in
            guard let swiftRange = Range(match.range, in: input) else { return nil }
            return String(input[swiftRange])
        }
    }

    private static func embedAccessToken(_ html: String) -> String? {
        let pattern = #"<script[^>]+id=[\"']__NEXT_DATA__[\"'][^>]*>([\s\S]*?)</script>"#
        guard let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = expression.firstMatch(
                in: html,
                range: NSRange(html.startIndex..<html.endIndex, in: html)
              ),
              match.numberOfRanges > 1,
              let payloadRange = Range(match.range(at: 1), in: html) else { return nil }

        let payload = String(html[payloadRange])
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#x27;", with: "'")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
        guard let data = payload.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let props = root["props"] as? [String: Any],
              let pageProps = props["pageProps"] as? [String: Any],
              let state = pageProps["state"] as? [String: Any],
              let settings = state["settings"] as? [String: Any],
              let session = settings["session"] as? [String: Any],
              let token = session["accessToken"] as? String,
              !token.isEmpty else { return nil }
        return token
    }

    private static func embedEntity(_ html: String) -> EmbedPayload.Entity? {
        guard let payload = embedPayloadData(html) else { return nil }
        return try? JSONDecoder().decode(EmbedPayload.self, from: payload).entity
    }

    private static func embedPayloadData(_ html: String) -> Data? {
        let pattern = #"<script[^>]+id=[\"']__NEXT_DATA__[\"'][^>]*>([\s\S]*?)</script>"#
        guard let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = expression.firstMatch(
                in: html,
                range: NSRange(html.startIndex..<html.endIndex, in: html)
              ),
              match.numberOfRanges > 1,
              let payloadRange = Range(match.range(at: 1), in: html) else { return nil }

        return String(html[payloadRange])
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#x27;", with: "'")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .data(using: .utf8)
    }

    private static func spotifyTracks(from tracks: [EmbedPayload.Entity.Track]) -> [SpotifyTrack] {
        tracks.compactMap { track in
            guard let id = trackID(from: track.uri), !track.title.isEmpty else { return nil }
            return SpotifyTrack(
                spotifyTrackId: id,
                isrc: nil,
                name: track.title,
                artists: artistNames(track.subtitle),
                album: nil,
                albumImageUrl: nil,
                durationMs: track.duration
            )
        }
    }

    private static func trackID(from uri: String) -> String? {
        guard let range = uri.range(of: #"spotify:track:([A-Za-z0-9]{22})"#, options: .regularExpression) else {
            return nil
        }
        return String(uri[range]).split(separator: ":").last.map(String.init)
    }

    private static func artistNames(_ subtitle: String?) -> [String] {
        guard let subtitle else { return [] }
        return subtitle
            .replacingOccurrences(of: "\u{00A0}", with: " ")
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private static func uniqueTrackIDs(_ uris: [String]) -> [String] {
        var seen: Set<String> = []
        return uris.compactMap { uri in
            guard let range = uri.range(of: #"spotify:track:([A-Za-z0-9]{22})"#, options: .regularExpression) else {
                return nil
            }
            let id = String(uri[range]).split(separator: ":").last.map(String.init)
            guard let id, seen.insert(id).inserted else { return nil }
            return id
        }
    }

}
