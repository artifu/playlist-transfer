import Foundation
import MusicKit

struct CreatedAppleMusicPlaylist: Equatable, Sendable {
    let id: String
    let name: String
    let url: URL?
    let trackCount: Int
}

enum AppleMusicLibraryWriterError: LocalizedError {
    case authorizationDenied(MusicAuthorization.Status)
    case catalogSubscriptionUnavailable
    case cloudLibraryDisabled
    case noReadyTracks
    case noCatalogSongsFound

    var errorDescription: String? {
        switch self {
        case .authorizationDenied(let status):
            return "Apple Music access was not granted (\(status.description)). Enable Apple Music access and try again."
        case .catalogSubscriptionUnavailable:
            return "This Apple ID cannot add Apple Music catalog songs right now. Check the Apple Music subscription, then try again."
        case .cloudLibraryDisabled:
            return "Sync Library is disabled for Apple Music. Turn on Sync Library, then try creating the playlist again."
        case .noReadyTracks:
            return "There are no confident Apple Music matches ready to transfer."
        case .noCatalogSongsFound:
            return "Apple Music could not load the matched catalog songs for this playlist."
        }
    }
}

struct AppleMusicLibraryWriter: Sendable {
    func createPlaylist(
        from analysis: TransferAnalysis,
        itemIDsToTransfer: Set<Int>? = nil,
        progress: (@MainActor (String) -> Void)? = nil
    ) async throws -> CreatedAppleMusicPlaylist {
        await progress?("Checking Apple Music permission...")
        print("[PlaylistXfer] Checking Apple Music authorization.")

        let authorizationStatus = MusicAuthorization.currentStatus == .authorized
            ? MusicAuthorization.currentStatus
            : await MusicAuthorization.request()

        guard authorizationStatus == .authorized else {
            throw AppleMusicLibraryWriterError.authorizationDenied(authorizationStatus)
        }

        await progress?("Checking Apple Music subscription and Sync Library...")
        print("[PlaylistXfer] Apple Music authorized. Checking subscription.")

        let subscription = try await MusicSubscription.current
        guard subscription.canPlayCatalogContent else {
            throw AppleMusicLibraryWriterError.catalogSubscriptionUnavailable
        }
        guard subscription.hasCloudLibraryEnabled else {
            throw AppleMusicLibraryWriterError.cloudLibraryDisabled
        }

        let songIDs = appleMusicSongIDs(from: analysis, itemIDsToTransfer: itemIDsToTransfer)
        guard !songIDs.isEmpty else { throw AppleMusicLibraryWriterError.noReadyTracks }

        await progress?("Loading \(songIDs.count) matched Apple Music songs...")
        print("[PlaylistXfer] Loading \(songIDs.count) catalog songs before playlist creation.")

        let songs = try await catalogSongs(for: songIDs)
        guard !songs.isEmpty else { throw AppleMusicLibraryWriterError.noCatalogSongsFound }

        await progress?("Creating the playlist in your Apple Music library...")
        print("[PlaylistXfer] Creating Apple Music playlist with \(songs.count) songs.")

        let playlistName = "\(analysis.playlist.name) (Transferred from Spotify)"
        let playlist = try await MusicLibrary.shared.createPlaylist(
            name: playlistName,
            description: "Transferred from Spotify with PlaylistXfer. Review and missing tracks were left out.",
            authorDisplayName: "PlaylistXfer",
            items: songs
        )

        return CreatedAppleMusicPlaylist(
            id: playlist.id.rawValue,
            name: playlist.name,
            url: playlist.url,
            trackCount: songs.count
        )
    }

    private func appleMusicSongIDs(from analysis: TransferAnalysis, itemIDsToTransfer: Set<Int>?) -> [MusicItemID] {
        analysis.items.compactMap { item in
            if let itemIDsToTransfer {
                guard itemIDsToTransfer.contains(item.id) else { return nil }
            } else {
                guard item.status == "matched" else { return nil }
            }

            guard let appleSongID = item.appleCandidate?.id else {
                return nil
            }

            return MusicItemID(appleSongID)
        }
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
