import Foundation
import MusicKit

struct CreatedAppleMusicPlaylist: Codable, Equatable, Sendable {
    let id: String
    let name: String
    let url: URL?
    let trackCount: Int
}

enum AppleMusicLibraryWriterError: LocalizedError {
    case authorizationDenied(MusicAuthorization.Status)
    case catalogSubscriptionUnavailable
    case cloudLibraryDisabled
    case developerTokenUnavailable(String)
    case noReadyTracks
    case noCatalogSongsFound
    case playlistNotFound(String)

    var errorDescription: String? {
        switch self {
        case .authorizationDenied(let status):
            return "Apple Music access was not granted (\(status.description)). Enable Apple Music access and try again."
        case .catalogSubscriptionUnavailable:
            return "This Apple ID cannot add Apple Music catalog songs right now. Check the Apple Music subscription, then try again."
        case .cloudLibraryDisabled:
            return "Sync Library is disabled for Apple Music. Turn on Sync Library, then try creating the playlist again."
        case .developerTokenUnavailable(let detail):
            return "MusicKit could not request a developer token. Enable the MusicKit service for this app's identifier in Apple Developer, refresh Xcode signing, then try again. \(detail)"
        case .noReadyTracks:
            return "There are no confident Apple Music matches ready to transfer."
        case .noCatalogSongsFound:
            return "Apple Music could not load the matched catalog songs for this playlist."
        case .playlistNotFound(let name):
            return "PlaylistXfer could not find \"\(name)\" in your Apple Music library. It may have been deleted or renamed."
        }
    }
}

struct AppleMusicLibraryWriter: Sendable {
    static let inboxPlaylistName = "PlaylistXfer Inbox"

    func createPlaylist(
        from analysis: TransferAnalysis,
        itemIDsToTransfer: Set<Int>? = nil,
        candidateOverrides: [Int: AppleSongCandidate] = [:],
        playlistName requestedPlaylistName: String? = nil,
        progress: (@MainActor (String) -> Void)? = nil
    ) async throws -> CreatedAppleMusicPlaylist {
        do {
            try await authorizeAppleMusic(progress: progress)

            let songIDs = appleMusicSongIDs(
                from: analysis,
                itemIDsToTransfer: itemIDsToTransfer,
                candidateOverrides: candidateOverrides
            )
            guard !songIDs.isEmpty else { throw AppleMusicLibraryWriterError.noReadyTracks }

            await progress?("Loading \(songIDs.count) matched Apple Music songs...")
            print("[PlaylistXfer] Loading \(songIDs.count) catalog songs before playlist creation.")

            let songs = try await catalogSongs(for: songIDs)
            guard !songs.isEmpty else { throw AppleMusicLibraryWriterError.noCatalogSongsFound }

            await progress?("Creating the playlist in your Apple Music library...")
            print("[PlaylistXfer] Creating Apple Music playlist with \(songs.count) songs.")

            let playlistName = Self.destinationPlaylistName(
                from: requestedPlaylistName,
                fallbackSourceName: analysis.playlist.name
            )
            let playlist = try await MusicLibrary.shared.createPlaylist(
                name: playlistName,
                description: "Matched from a Spotify playlist with PlaylistXfer. Review and missing tracks were left out.",
                authorDisplayName: "PlaylistXfer",
                items: songs
            )

            return CreatedAppleMusicPlaylist(
                id: playlist.id.rawValue,
                name: playlist.name,
                url: playlist.url,
                trackCount: songs.count
            )
        } catch let error as AppleMusicLibraryWriterError {
            throw error
        } catch {
            print("[PlaylistXfer] MusicKit create failed: \(error.localizedDescription)")
            throw mapMusicKitError(error)
        }
    }

    func addTrackToInbox(
        from analysis: TransferAnalysis,
        itemIDsToTransfer: Set<Int>? = nil,
        candidateOverrides: [Int: AppleSongCandidate] = [:],
        progress: (@MainActor (String) -> Void)? = nil
    ) async throws -> CreatedAppleMusicPlaylist {
        do {
            try await authorizeAppleMusic(progress: progress)

            let songIDs = appleMusicSongIDs(
                from: analysis,
                itemIDsToTransfer: itemIDsToTransfer,
                candidateOverrides: candidateOverrides
            )
            guard let songID = songIDs.first else { throw AppleMusicLibraryWriterError.noReadyTracks }

            await progress?("Loading the Apple Music song...")
            guard let song = try await catalogSongs(for: [songID]).first else {
                throw AppleMusicLibraryWriterError.noCatalogSongsFound
            }

            await progress?("Adding the song to \(Self.inboxPlaylistName)...")
            let inbox = try await findOrCreateInbox()
            let updatedInbox = try await MusicLibrary.shared.add(song, to: inbox)

            return CreatedAppleMusicPlaylist(
                id: updatedInbox.id.rawValue,
                name: updatedInbox.name,
                url: updatedInbox.url,
                trackCount: 1
            )
        } catch let error as AppleMusicLibraryWriterError {
            throw error
        } catch {
            print("[PlaylistXfer] MusicKit inbox add failed: \(error.localizedDescription)")
            throw mapMusicKitError(error)
        }
    }

    func addTracks(
        to createdPlaylist: CreatedAppleMusicPlaylist,
        from analysis: TransferAnalysis,
        itemIDsToTransfer: Set<Int>,
        candidateOverrides: [Int: AppleSongCandidate] = [:],
        progress: (@MainActor (String) -> Void)? = nil
    ) async throws -> CreatedAppleMusicPlaylist {
        do {
            try await authorizeAppleMusic(progress: progress)

            let songIDs = appleMusicSongIDs(
                from: analysis,
                itemIDsToTransfer: itemIDsToTransfer,
                candidateOverrides: candidateOverrides
            )
            guard !songIDs.isEmpty else { throw AppleMusicLibraryWriterError.noReadyTracks }

            await progress?("Loading \(songIDs.count) new Apple Music \(songIDs.count == 1 ? "song" : "songs")...")
            let songs = try await catalogSongs(for: songIDs)
            guard !songs.isEmpty else { throw AppleMusicLibraryWriterError.noCatalogSongsFound }

            await progress?("Finding \(createdPlaylist.name) in your Apple Music library...")
            var libraryPlaylist = try await findPlaylist(
                id: createdPlaylist.id,
                name: createdPlaylist.name
            )

            for (index, song) in songs.enumerated() {
                await progress?("Adding new \(index + 1) of \(songs.count)...")
                libraryPlaylist = try await MusicLibrary.shared.add(song, to: libraryPlaylist)
            }

            return CreatedAppleMusicPlaylist(
                id: libraryPlaylist.id.rawValue,
                name: libraryPlaylist.name,
                url: libraryPlaylist.url ?? createdPlaylist.url,
                trackCount: createdPlaylist.trackCount + songs.count
            )
        } catch let error as AppleMusicLibraryWriterError {
            throw error
        } catch {
            print("[PlaylistXfer] MusicKit playlist update failed: \(error.localizedDescription)")
            throw mapMusicKitError(error)
        }
    }

    static func destinationPlaylistName(from requestedName: String?, fallbackSourceName: String) -> String {
        let trimmedRequest = requestedName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard trimmedRequest.isEmpty else {
            return String(trimmedRequest.prefix(120))
        }

        return defaultPlaylistName(for: fallbackSourceName)
    }

    static func defaultPlaylistName(for sourceName: String) -> String {
        var baseName = sourceName.trimmingCharacters(in: .whitespacesAndNewlines)
        let suffixesToNormalize = [
            " (Transferred from Spotify)",
            " (PlaylistXfer)"
        ]

        for suffix in suffixesToNormalize where baseName.lowercased().hasSuffix(suffix.lowercased()) {
            baseName.removeLast(suffix.count)
            baseName = baseName.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        if baseName.isEmpty {
            baseName = "Spotify Playlist"
        }

        return String("\(baseName) (PlaylistXfer)".prefix(120))
    }

    private func appleMusicSongIDs(
        from analysis: TransferAnalysis,
        itemIDsToTransfer: Set<Int>?,
        candidateOverrides: [Int: AppleSongCandidate]
    ) -> [MusicItemID] {
        analysis.items.compactMap { item in
            if let itemIDsToTransfer {
                guard itemIDsToTransfer.contains(item.id) else { return nil }
            } else {
                guard item.status == "matched" else { return nil }
            }

            let selectedCandidate = candidateOverrides[item.id] ?? item.appleCandidate
            guard let appleSongID = selectedCandidate?.id else {
                return nil
            }

            return MusicItemID(appleSongID)
        }
    }

    private func authorizeAppleMusic(
        progress: (@MainActor (String) -> Void)?
    ) async throws {
        await progress?("Checking Apple Music permission...")
        print("[PlaylistXfer] Checking Apple Music authorization.")

        let authorizationStatus = MusicAuthorization.currentStatus == .authorized
            ? MusicAuthorization.currentStatus
            : await MusicAuthorization.request()

        guard authorizationStatus == .authorized else {
            throw AppleMusicLibraryWriterError.authorizationDenied(authorizationStatus)
        }

        await progress?("Checking Apple Music subscription and Sync Library...")
        let subscription = try await MusicSubscription.current
        guard subscription.canPlayCatalogContent else {
            throw AppleMusicLibraryWriterError.catalogSubscriptionUnavailable
        }
        guard subscription.hasCloudLibraryEnabled else {
            throw AppleMusicLibraryWriterError.cloudLibraryDisabled
        }
    }

    private func findOrCreateInbox() async throws -> Playlist {
        var request = MusicLibraryRequest<Playlist>()
        request.filter(matching: \.name, equalTo: Self.inboxPlaylistName)
        request.limit = 25

        let response = try await request.response()
        if let inbox = response.items.first(where: {
            $0.name.compare(Self.inboxPlaylistName, options: .caseInsensitive) == .orderedSame
        }) {
            return inbox
        }

        return try await MusicLibrary.shared.createPlaylist(
            name: Self.inboxPlaylistName,
            description: "Songs matched from Spotify links with PlaylistXfer.",
            authorDisplayName: "PlaylistXfer"
        )
    }

    private func findPlaylist(id: String, name: String) async throws -> Playlist {
        var idRequest = MusicLibraryRequest<Playlist>()
        idRequest.filter(matching: \.id, equalTo: MusicItemID(id))
        idRequest.limit = 1

        if let playlist = try await idRequest.response().items.first {
            return playlist
        }

        var nameRequest = MusicLibraryRequest<Playlist>()
        nameRequest.filter(matching: \.name, equalTo: name)
        nameRequest.limit = 25

        let nameResponse = try await nameRequest.response()
        if let playlist = nameResponse.items.first(where: {
            $0.id.rawValue == id
        }) ?? nameResponse.items.first(where: {
            $0.name.compare(name, options: .caseInsensitive) == .orderedSame
        }) {
            return playlist
        }

        throw AppleMusicLibraryWriterError.playlistNotFound(name)
    }

    private func mapMusicKitError(_ error: Error) -> Error {
        let detail = error.localizedDescription
        if detail.localizedCaseInsensitiveContains("developer token") {
            return AppleMusicLibraryWriterError.developerTokenUnavailable("Underlying error: \(detail)")
        }

        return error
    }

    private func catalogSongs(for ids: [MusicItemID]) async throws -> [Song] {
        var songsByID: [MusicItemID: Song] = [:]

        for chunk in ids.chunked(into: 100) {
            var request = MusicCatalogResourceRequest<Song>(matching: \.id, memberOf: chunk)
            request.limit = chunk.count

            let response = try await request.response()
            for song in response.items {
                songsByID[song.id] = song
            }
        }

        return ids.compactMap { songsByID[$0] }
    }
}

private extension Array {
    func chunked(into size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map { startIndex in
            Array(self[startIndex..<Swift.min(startIndex + size, count)])
        }
    }
}
