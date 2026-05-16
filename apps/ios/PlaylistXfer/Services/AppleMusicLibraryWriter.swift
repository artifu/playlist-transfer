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
    func createPlaylist(from analysis: TransferAnalysis) async throws -> CreatedAppleMusicPlaylist {
        let authorizationStatus = MusicAuthorization.currentStatus == .authorized
            ? MusicAuthorization.currentStatus
            : await MusicAuthorization.request()

        guard authorizationStatus == .authorized else {
            throw AppleMusicLibraryWriterError.authorizationDenied(authorizationStatus)
        }

        let subscription = try await MusicSubscription.current
        guard subscription.canPlayCatalogContent else {
            throw AppleMusicLibraryWriterError.catalogSubscriptionUnavailable
        }
        guard subscription.hasCloudLibraryEnabled else {
            throw AppleMusicLibraryWriterError.cloudLibraryDisabled
        }

        let songIDs = readyAppleMusicSongIDs(from: analysis)
        guard !songIDs.isEmpty else { throw AppleMusicLibraryWriterError.noReadyTracks }

        let songs = try await catalogSongs(for: songIDs)
        guard !songs.isEmpty else { throw AppleMusicLibraryWriterError.noCatalogSongsFound }

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

    private func readyAppleMusicSongIDs(from analysis: TransferAnalysis) -> [MusicItemID] {
        analysis.items.compactMap { item in
            guard item.status == "matched", let appleSongID = item.appleCandidate?.id else {
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
