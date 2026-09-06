import Foundation
import MusicKit

struct AppleMusicLocalMatcher: Sendable {
    typealias Progress = @MainActor @Sendable (_ completed: Int, _ total: Int) -> Void

    private struct MatchResult: Sendable {
        let matched: Bool
        let confidence: Double
        let reason: String?
        let candidate: AppleSongCandidate?
        let candidates: [AppleSongCandidate]
    }

    func analyze(
        preview: PlaylistPreviewResponse,
        progress: Progress? = nil
    ) async throws -> TransferAnalysis {
        let tracks = Array(preview.tracks.prefix(AppConfig.defaultAnalysisLimit))
        guard !tracks.isEmpty else {
            throw SpotifyLocalIngestionError.incompletePlaylist(expected: 1, received: 0)
        }

        var items = [TransferItem?](repeating: nil, count: tracks.count)
        let candidatesByISRC = try await batchCandidatesByISRC(tracks)
        var fallbackEntries: [(Int, SpotifyTrack)] = []
        var completed = 0

        for (index, track) in tracks.enumerated() {
            let isrc = Self.normalizedISRC(track.isrc)
            let candidates = isrc.flatMap { candidatesByISRC[$0] } ?? []
            let result = Self.pickBestMatch(track: track, candidates: candidates)

            if result.reason == "isrc" {
                items[index] = Self.transferItem(track: track, index: index, result: result)
                completed += 1
                await progress?(completed, tracks.count)
            } else {
                fallbackEntries.append((index, track))
            }
        }

        for start in stride(from: 0, to: fallbackEntries.count, by: 4) {
            let end = min(start + 4, fallbackEntries.count)
            let chunk = Array(fallbackEntries[start..<end])
            let results = try await withThrowingTaskGroup(of: (Int, TransferItem).self) { group in
                for (index, track) in chunk {
                    group.addTask {
                        let result = try await Self.analyzeTrack(track)
                        return (index, Self.transferItem(track: track, index: index, result: result))
                    }
                }

                var values: [(Int, TransferItem)] = []
                for try await value in group {
                    values.append(value)
                }
                return values
            }

            for (index, item) in results {
                items[index] = item
                completed += 1
                await progress?(completed, tracks.count)
            }
        }

        let resolvedItems = items.compactMap { $0 }
        guard resolvedItems.count == tracks.count else {
            throw SpotifyLocalIngestionError.incompletePlaylist(
                expected: tracks.count,
                received: resolvedItems.count
            )
        }

        let unmatched = resolvedItems.filter { $0.status == "unmatched" }.count
        let review = resolvedItems.filter { $0.status == "needs_review" }.count
        let ready = resolvedItems.filter { $0.status == "matched" }.count
        let matched = resolvedItems.count - unmatched

        return TransferAnalysis(
            playlist: AnalyzedPlaylist(
                id: preview.playlist.id,
                name: preview.playlist.name,
                kind: preview.playlist.kind,
                imageUrl: preview.playlist.imageUrl,
                totalItems: resolvedItems.count,
                originalTotalItems: preview.playlist.totalItems,
                analyzedTrackCount: resolvedItems.count,
                partialAnalysis: resolvedItems.count < (preview.playlist.totalItems ?? resolvedItems.count),
                source: "\(preview.playlist.source ?? "spotify-local")+apple-music-local",
                limitations: preview.playlist.limitations
            ),
            summary: TransferSummary(
                matchedCount: matched,
                unmatchedCount: unmatched,
                needsReviewCount: review,
                confidentMatchCount: ready,
                matchRate: resolvedItems.isEmpty ? 0 : Double(matched) / Double(resolvedItems.count)
            ),
            items: resolvedItems,
            transferId: nil,
            transfer: nil,
            createdApplePlaylistId: nil
        )
    }

    func searchSongs(_ term: String, limit: Int = 10) async throws -> [AppleSongCandidate] {
        let trimmed = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        var request = MusicCatalogSearchRequest(term: trimmed, types: [Song.self])
        request.limit = min(max(limit, 1), 15)
        let response = try await request.response()
        return response.songs.map { Self.candidate($0) }
    }

    private func batchCandidatesByISRC(
        _ tracks: [SpotifyTrack]
    ) async throws -> [String: [AppleSongCandidate]] {
        let isrcs = Array(Set(tracks.compactMap { Self.normalizedISRC($0.isrc) })).sorted()
        guard !isrcs.isEmpty else { return [:] }

        var candidatesByISRC: [String: [AppleSongCandidate]] = [:]
        for start in stride(from: 0, to: isrcs.count, by: 25) {
            let end = min(start + 25, isrcs.count)
            let chunk = Array(isrcs[start..<end])
            var request = MusicCatalogResourceRequest<Song>(matching: \.isrc, memberOf: chunk)
            request.limit = chunk.count * 3
            let response = try await request.response()

            for song in response.items {
                guard let isrc = Self.normalizedISRC(song.isrc) else { continue }
                candidatesByISRC[isrc, default: []].append(Self.candidate(song))
            }
        }
        return candidatesByISRC
    }

    private static func analyzeTrack(_ track: SpotifyTrack) async throws -> MatchResult {
        var candidates: [AppleSongCandidate] = []
        var seenIDs: Set<String> = []
        var best = Self.pickBestMatch(track: track, candidates: [])

        for term in Self.searchTerms(track) {
            var request = MusicCatalogSearchRequest(term: term, types: [Song.self])
            request.limit = 10
            let response = try await request.response()
            for song in response.songs {
                let candidate = Self.candidate(song)
                if seenIDs.insert(candidate.id).inserted {
                    candidates.append(candidate)
                }
            }

            best = Self.pickBestMatch(track: track, candidates: candidates)
            if best.reason == "isrc" || best.confidence >= 0.96 { break }
        }
        return best
    }

    private static func transferItem(
        track: SpotifyTrack,
        index: Int,
        result: MatchResult
    ) -> TransferItem {
        let status: String
        if !result.matched {
            status = "unmatched"
        } else if result.confidence < 0.8 {
            status = "needs_review"
        } else {
            status = "matched"
        }

        return TransferItem(
            index: index + 1,
            status: status,
            source: track,
            confidence: result.confidence,
            reason: result.reason,
            appleCandidate: result.candidate,
            candidateCount: result.candidates.count,
            candidates: Array(result.candidates.prefix(3))
        )
    }

    private static func pickBestMatch(
        track: SpotifyTrack,
        candidates: [AppleSongCandidate]
    ) -> MatchResult {
        guard !candidates.isEmpty else {
            return MatchResult(
                matched: false,
                confidence: 0,
                reason: nil,
                candidate: nil,
                candidates: []
            )
        }

        if let sourceISRC = normalizedISRC(track.isrc),
           let byISRC = candidates
            .filter({ normalizedISRC($0.isrc) == sourceISRC })
            .max(by: { isrcScore(track, $0) < isrcScore(track, $1) }) {
            return MatchResult(
                matched: true,
                confidence: 1,
                reason: "isrc",
                candidate: byISRC,
                candidates: candidates
            )
        }

        let primaryArtist = track.artists.first ?? ""
        if let exact = candidates.first(where: {
            $0.name.localizedCaseInsensitiveCompare(track.name) == .orderedSame
                && $0.artistName.localizedCaseInsensitiveCompare(primaryArtist) == .orderedSame
        }) {
            return MatchResult(
                matched: true,
                confidence: 0.96,
                reason: "exact-title-artist",
                candidate: exact,
                candidates: candidates
            )
        }

        if let normalized = candidates.first(where: {
            namesRoughlyMatch(track.name, $0.name)
                && namesRoughlyMatch(primaryArtist, $0.artistName)
                && durationDifference(track.durationMs, $0.durationMs) < 5_000
        }) {
            return MatchResult(
                matched: true,
                confidence: 0.82,
                reason: "normalized-title-artist",
                candidate: normalized,
                candidates: candidates
            )
        }

        let artistKey = normalize(primaryArtist)
        if !artistKey.isEmpty,
           let fallback = candidates.first(where: { normalize($0.artistName).contains(artistKey) }) {
            return MatchResult(
                matched: true,
                confidence: 0.55,
                reason: "artist-only-fallback",
                candidate: fallback,
                candidates: candidates
            )
        }

        return MatchResult(
            matched: false,
            confidence: 0,
            reason: nil,
            candidate: nil,
            candidates: candidates
        )
    }

    private static func searchTerms(_ track: SpotifyTrack) -> [String] {
        let artist = track.artists.first ?? ""
        let rawTerms = [
            "\(track.name) \(artist)",
            track.album.map { "\(track.name) \($0)" } ?? "",
            track.name
        ]
        var seen: Set<String> = []
        return rawTerms
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && seen.insert($0).inserted }
    }

    private static func isrcScore(_ track: SpotifyTrack, _ candidate: AppleSongCandidate) -> Int {
        let artist = track.artists.first ?? ""
        var score = 0
        if namesRoughlyMatch(track.name, candidate.name) { score += 4 }
        if namesRoughlyMatch(artist, candidate.artistName) { score += 4 }
        if let album = track.album,
           let candidateAlbum = candidate.albumName,
           namesRoughlyMatch(album, candidateAlbum) { score += 3 }

        let difference = durationDifference(track.durationMs, candidate.durationMs)
        if difference < 2_000 { score += 2 }
        else if difference < 5_000 { score += 1 }
        return score
    }

    private static func candidate(_ song: Song) -> AppleSongCandidate {
        AppleSongCandidate(
            id: song.id.rawValue,
            name: song.title,
            artistName: song.artistName,
            albumName: song.albumTitle,
            durationMs: song.duration.map { Int(($0 * 1_000).rounded()) },
            isrc: song.isrc,
            url: song.url,
            artworkUrl: song.artwork?.url(width: 300, height: 300)
        )
    }

    private static func normalizedISRC(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return normalized?.isEmpty == false ? normalized : nil
    }

    private static func durationDifference(_ left: Int?, _ right: Int?) -> Int {
        guard let left, let right else { return .max }
        return abs(left - right)
    }

    private static func namesRoughlyMatch(_ left: String, _ right: String) -> Bool {
        let left = normalize(left)
        let right = normalize(right)
        guard !left.isEmpty, !right.isEmpty else { return false }
        return left == right || left.contains(right) || right.contains(left)
    }

    private static func normalize(_ input: String) -> String {
        var value = input.folding(
            options: [.diacriticInsensitive, .caseInsensitive],
            locale: Locale(identifier: "en_US_POSIX")
        )
        let removablePatterns = [
            #"\((feat|ft|with)[^)]*\)"#,
            #"\[(feat|ft|with)[^]]*\]"#,
            #"\((remaster|remastered|live|mono|stereo)[^)]*\)"#,
            #"\[(remaster|remastered|live|mono|stereo)[^]]*\]"#
        ]
        for pattern in removablePatterns {
            value = value.replacingOccurrences(of: pattern, with: "", options: .regularExpression)
        }
        value = value.replacingOccurrences(of: #"[^a-z0-9]+"#, with: " ", options: .regularExpression)
        value = value.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        return value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
