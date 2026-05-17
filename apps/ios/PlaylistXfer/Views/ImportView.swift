import SwiftUI

struct ImportView: View {
    @Environment(\.openURL) private var openURL
    @StateObject private var viewModel = TransferViewModel()
    @FocusState private var playlistFieldFocused: Bool

    var body: some View {
        ScrollViewReader { scrollProxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    hero
                    importCard
                    statusCard

                    if let preview = viewModel.preview {
                        PlaylistPreviewCard(preview: preview)
                            .id("preview")
                    }

                    if let analysis = viewModel.analysis {
                        MatchReportView(
                            analysis: analysis,
                            readyItems: viewModel.readyItems,
                            reviewItems: viewModel.reviewItems,
                            missingItems: viewModel.missingItems,
                            skippedItems: viewModel.skippedItems,
                            approveSuggestedMatch: viewModel.approveSuggestedMatch,
                            skipTrack: viewModel.skipTrack,
                            restoreTrack: viewModel.restoreTrack
                        )
                        .id("report")
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 28)
                .padding(.bottom, 120)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(AppTheme.background.ignoresSafeArea())
            .safeAreaInset(edge: .bottom) {
                bottomActionBar
            }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Button("Preview") {
                        submitPreview()
                    }
                    .fontWeight(.bold)
                    .disabled(!viewModel.canPreview)

                    Spacer()

                    Button("Done") {
                        playlistFieldFocused = false
                    }
                    .fontWeight(.bold)
                }
            }
            .onChange(of: viewModel.phase) { _, phase in
                if phase == .previewReady {
                    playlistFieldFocused = false
                    withAnimation(.snappy(duration: 0.35)) {
                        scrollProxy.scrollTo("preview", anchor: .top)
                    }
                }

                if phase == .analysisReady {
                    playlistFieldFocused = false
                    withAnimation(.snappy(duration: 0.35)) {
                        scrollProxy.scrollTo("report", anchor: .top)
                    }
                }
            }
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack {
                HStack(spacing: 9) {
                    BrandMark(size: 30)
                    Text("PlaylistXfer")
                        .font(.caption)
                        .fontWeight(.black)
                        .tracking(1.8)
                        .foregroundStyle(AppTheme.inkMuted)
                        .textCase(.uppercase)
                }

                Spacer()

                HStack(spacing: 7) {
                    Circle()
                        .fill(AppTheme.spotify)
                        .frame(width: 7, height: 7)
                    Text("Public link MVP")
                        .font(.caption2.monospaced().weight(.bold))
                        .foregroundStyle(AppTheme.inkMuted)
                        .textCase(.uppercase)
                }
            }

            Text("Drop a link.\nWe'll do the digging.")
                .font(.system(size: 42, weight: .black, design: .serif))
                .italic()
                .foregroundStyle(AppTheme.ink)
                .lineLimit(nil)
                .minimumScaleFactor(0.76)

            Text("Move public Spotify playlists into Apple Music. We preview first, match every track, and show what will not make it over.")
                .font(.body)
                .foregroundStyle(AppTheme.inkSoft)
        }
    }

    private var importCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Spotify playlist URL", systemImage: "link")
                .font(.caption)
                .fontWeight(.black)
                .tracking(1.8)
                .foregroundStyle(AppTheme.spotify)
                .textCase(.uppercase)

            TextField("https://open.spotify.com/playlist/...", text: $viewModel.playlistInput)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .submitLabel(.go)
                .font(.system(.body, design: .monospaced))
                .lineLimit(1)
                .padding(14)
                .background(AppTheme.inset)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(AppTheme.lineStrong, lineWidth: 1.5)
                )
                .focused($playlistFieldFocused)
                .onSubmit {
                    submitPreview()
                }

            Button {
                submitPreview()
            } label: {
                ActionButtonLabel(
                    title: viewModel.preview == nil ? "Preview public link" : "Refresh preview",
                    systemImage: "arrow.right",
                    background: viewModel.canPreview ? AppTheme.spotify : AppTheme.disabledFill,
                    foreground: viewModel.canPreview ? .white : AppTheme.inkMuted
                )
            }
            .buttonStyle(.plain)
            .disabled(!viewModel.canPreview)
        }
        .padding(16)
        .background(AppTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(AppTheme.border, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.04), radius: 24, y: 10)
    }

    private func submitPreview() {
        guard viewModel.canPreview else { return }
        playlistFieldFocused = false
        Task { await viewModel.previewPlaylist() }
    }

    private var statusCard: some View {
        HStack(alignment: .top, spacing: 12) {
            ProgressView()
                .opacity(viewModel.isBusy ? 1 : 0)
            Text(viewModel.statusMessage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(statusColor)
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(statusBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var statusColor: Color {
        if case .failed = viewModel.phase { return AppTheme.danger }
        if case .created = viewModel.phase { return AppTheme.spotify }
        return AppTheme.ink
    }

    private var statusBackground: Color {
        if case .failed = viewModel.phase { return AppTheme.danger.opacity(0.1) }
        if case .created = viewModel.phase { return AppTheme.spotify.opacity(0.12) }
        return AppTheme.spotify.opacity(0.12)
    }

    private var shouldShowStickyStatus: Bool {
        if viewModel.isBusy || viewModel.createdPlaylist != nil { return true }
        if case .failed = viewModel.phase { return true }
        return false
    }

    @ViewBuilder
    private var bottomActionBar: some View {
        if viewModel.preview != nil || viewModel.analysis != nil {
            VStack(alignment: .leading, spacing: 10) {
                if shouldShowStickyStatus {
                    Text(viewModel.statusMessage)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(statusColor)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(statusBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                if let createdPlaylist = viewModel.createdPlaylist {
                    Text("\(createdPlaylist.trackCount) tracks transferred")
                        .font(.caption.weight(.black))
                        .tracking(1.8)
                        .foregroundStyle(AppTheme.inkMuted)
                        .textCase(.uppercase)

                    Button {
                        if let url = createdPlaylist.url {
                            openURL(url)
                        }
                    } label: {
                        ActionButtonLabel(
                            title: "Open in Apple Music",
                            systemImage: "music.note",
                            background: createdPlaylist.url == nil ? AppTheme.disabledFill : AppTheme.spotify,
                            foreground: createdPlaylist.url == nil ? AppTheme.inkMuted : .white
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(createdPlaylist.url == nil)
                } else if let analysis = viewModel.analysis {
                    Text("\(analysis.summary.confidentMatchCount) ready tracks")
                        .font(.caption.weight(.black))
                        .tracking(1.8)
                        .foregroundStyle(AppTheme.inkMuted)
                        .textCase(.uppercase)

                    Button {
                        playlistFieldFocused = false
                        Task { await viewModel.createAppleMusicPlaylist() }
                    } label: {
                        ActionButtonLabel(
                            title: viewModel.isBusy ? "Creating playlist..." : "Create Apple Music playlist",
                            systemImage: "music.note.list",
                            background: viewModel.canCreate ? AppTheme.apple : AppTheme.disabledFill,
                            foreground: viewModel.canCreate ? .white : AppTheme.inkMuted
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(!viewModel.canCreate)
                } else {
                    Text("Playlist preview loaded")
                        .font(.caption.weight(.black))
                        .tracking(1.8)
                        .foregroundStyle(AppTheme.inkMuted)
                        .textCase(.uppercase)

                    Button {
                        playlistFieldFocused = false
                        Task { await viewModel.analyzeMatches() }
                    } label: {
                        ActionButtonLabel(
                            title: "Analyze matches",
                            systemImage: "wand.and.stars",
                            background: viewModel.canAnalyze ? AppTheme.actionBlue : AppTheme.disabledFill,
                            foreground: viewModel.canAnalyze ? .white : AppTheme.inkMuted
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(!viewModel.canAnalyze)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 14)
            .padding(.bottom, 12)
            .background(.regularMaterial)
            .overlay(alignment: .top) {
                Divider()
            }
        }
    }
}

private struct BrandMark: View {
    let size: CGFloat

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
                .fill(AppTheme.ink)

            ZStack {
                RoundedRectangle(cornerRadius: size * 0.12, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [AppTheme.spotify.opacity(0.72), AppTheme.card, AppTheme.apple.opacity(0.82)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: size * 0.56, height: size * 0.36)
                    .offset(x: size * 0.04)

                Circle()
                    .fill(AppTheme.ink)
                    .frame(width: size * 0.20, height: size * 0.20)
                    .offset(x: -size * 0.06)

                RoundedRectangle(cornerRadius: size * 0.018, style: .continuous)
                    .fill(AppTheme.ink)
                    .frame(width: size * 0.11, height: size * 0.30)
                    .offset(x: size * 0.16)
            }
        }
        .frame(width: size, height: size)
    }
}

private struct PlaylistPreviewCard: View {
    let preview: PlaylistPreviewResponse
    @State private var showsAllTracks = false

    private let collapsedTrackLimit = 8

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .center, spacing: 16) {
                ArtworkView(url: preview.playlist.imageUrl, size: 92)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Public Spotify playlist")
                        .font(.caption)
                        .fontWeight(.black)
                        .tracking(1.8)
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)
                    Text(preview.playlist.name)
                        .font(.system(size: 30, weight: .black, design: .serif))
                        .italic()
                    Text(trackCountText)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                }
            }

            VStack(spacing: 0) {
                ForEach(Array(visibleTracks.enumerated()), id: \.element.id) { index, track in
                    TrackPreviewRow(index: index + 1, track: track)
                    if index < visibleTracks.count - 1 {
                        Divider()
                    }
                }
            }
            .background(Color.white.opacity(0.64))
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))

            if preview.tracks.count > collapsedTrackLimit {
                Button {
                    withAnimation(.snappy(duration: 0.25)) {
                        showsAllTracks.toggle()
                    }
                } label: {
                    Text(showsAllTracks ? "Show fewer preview tracks" : "Show all \(preview.tracks.count) preview tracks")
                        .font(.caption.weight(.black))
                        .tracking(1.2)
                        .foregroundStyle(AppTheme.actionBlue)
                        .textCase(.uppercase)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(18)
        .background(AppTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(AppTheme.border, lineWidth: 1)
        )
    }

    private var visibleTracks: [SpotifyTrack] {
        showsAllTracks ? preview.tracks : Array(preview.tracks.prefix(collapsedTrackLimit))
    }

    private var trackCountText: String {
        let total = preview.playlist.totalItems ?? preview.tracks.count
        if total > preview.tracks.count {
            return "\(preview.tracks.count) readable tracks fetched from \(total) total"
        }

        return "\(preview.tracks.count) readable tracks"
    }
}

private struct MatchReportView: View {
    let analysis: TransferAnalysis
    let readyItems: [TransferItem]
    let reviewItems: [TransferItem]
    let missingItems: [TransferItem]
    let skippedItems: [TransferItem]
    let approveSuggestedMatch: (TransferItem) -> Void
    let skipTrack: (TransferItem) -> Void
    let restoreTrack: (TransferItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Match report")
                .font(.system(size: 34, weight: .black, design: .serif))
                .italic()

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                MetricCard(label: "Ready", value: "\(readyItems.count)", color: AppTheme.spotify)
                MetricCard(label: "Review", value: "\(reviewItems.count)", color: AppTheme.warning)
                MetricCard(label: "Missing", value: "\(missingItems.count)", color: AppTheme.danger)
                MetricCard(label: "Any match", value: "\(Int((analysis.summary.matchRate * 100).rounded()))%", color: AppTheme.ink)
            }

            if !reviewItems.isEmpty {
                TransferSection(
                    title: "Needs review",
                    items: reviewItems,
                    mode: .review,
                    approveSuggestedMatch: approveSuggestedMatch,
                    skipTrack: skipTrack,
                    restoreTrack: restoreTrack
                )
            }

            if !missingItems.isEmpty {
                TransferSection(
                    title: "Missing",
                    items: missingItems,
                    mode: .missing,
                    approveSuggestedMatch: approveSuggestedMatch,
                    skipTrack: skipTrack,
                    restoreTrack: restoreTrack
                )
            }

            TransferSection(
                title: "Ready to transfer",
                items: readyItems,
                mode: .ready,
                approveSuggestedMatch: approveSuggestedMatch,
                skipTrack: skipTrack,
                restoreTrack: restoreTrack
            )

            if !skippedItems.isEmpty {
                TransferSection(
                    title: "Skipped",
                    items: skippedItems,
                    mode: .skipped,
                    approveSuggestedMatch: approveSuggestedMatch,
                    skipTrack: skipTrack,
                    restoreTrack: restoreTrack
                )
            }
        }
    }
}

private enum TransferSectionMode: Equatable {
    case review
    case missing
    case ready
    case skipped
}

private struct TransferSection: View {
    let title: String
    let items: [TransferItem]
    let mode: TransferSectionMode
    let approveSuggestedMatch: (TransferItem) -> Void
    let skipTrack: (TransferItem) -> Void
    let restoreTrack: (TransferItem) -> Void

    @State private var showsAllItems = false

    private let collapsedItemLimit = 12

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(title) - \(items.count)")
                .font(.caption)
                .fontWeight(.black)
                .tracking(2)
                .foregroundStyle(sectionColor)
                .textCase(.uppercase)

            VStack(spacing: 0) {
                ForEach(visibleItems) { item in
                    TransferItemRow(
                        item: item,
                        mode: mode,
                        approveSuggestedMatch: approveSuggestedMatch,
                        skipTrack: skipTrack,
                        restoreTrack: restoreTrack
                    )
                    if item.id != visibleItems.last?.id {
                        Divider()
                    }
                }
            }
            .background(Color.white.opacity(0.72))
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))

            if items.count > collapsedItemLimit {
                Button {
                    withAnimation(.snappy(duration: 0.25)) {
                        showsAllItems.toggle()
                    }
                } label: {
                    Text(showsAllItems ? "Show fewer \(title.lowercased()) tracks" : "Show all \(items.count) \(title.lowercased()) tracks")
                        .font(.caption.weight(.black))
                        .tracking(1.2)
                        .foregroundStyle(sectionColor)
                        .textCase(.uppercase)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var visibleItems: [TransferItem] {
        showsAllItems ? items : Array(items.prefix(collapsedItemLimit))
    }

    private var sectionColor: Color {
        if title.lowercased().contains("skipped") { return AppTheme.inkMuted }
        if title.lowercased().contains("review") { return AppTheme.warning }
        if title.lowercased().contains("missing") { return AppTheme.danger }
        return AppTheme.spotify
    }
}

private struct TransferItemRow: View {
    let item: TransferItem
    let mode: TransferSectionMode
    let approveSuggestedMatch: (TransferItem) -> Void
    let skipTrack: (TransferItem) -> Void
    let restoreTrack: (TransferItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Text("\(item.index)")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(width: 34, alignment: .leading)

                ArtworkView(url: item.source.albumImageUrl, size: 52)

                VStack(alignment: .leading, spacing: 4) {
                    Text(item.source.name)
                        .font(.headline)
                    Text("\(item.source.artistText) - \(item.source.album ?? "Unknown album")")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 8)

                Text(item.confidencePercent)
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            HStack {
                Text(mode == .skipped ? "Skipped" : item.statusLabel)
                    .font(.caption.weight(.black))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(statusColor.opacity(0.16))
                    .foregroundStyle(statusColor)
                    .clipShape(Capsule())

                if let reason = item.reason {
                    Text(reason)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }
            }

            if let candidate = item.appleCandidate {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Apple Music candidate")
                        .font(.caption2)
                        .fontWeight(.black)
                        .tracking(1.5)
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)
                    Text(candidate.name)
                        .font(.headline)
                    Text("\(candidate.artistName) - \(candidate.albumName ?? "Unknown album")")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(alignment: .leading) {
                    Rectangle()
                        .fill(statusColor)
                        .frame(width: 3)
                }
            }

            if shouldShowActions {
                HStack(spacing: 10) {
                    if mode == .review, item.appleCandidate != nil {
                        Button {
                            approveSuggestedMatch(item)
                        } label: {
                            Text("Approve suggested")
                                .font(.caption.weight(.black))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(AppTheme.spotify)
                                .foregroundStyle(.white)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }

                    if mode == .ready || mode == .review {
                        Button {
                            skipTrack(item)
                        } label: {
                            Text(mode == .ready ? "Skip if wrong" : "Skip track")
                                .font(.caption.weight(.black))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(AppTheme.disabledFill)
                                .foregroundStyle(AppTheme.ink)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }

                    if mode == .skipped {
                        Button {
                            restoreTrack(item)
                        } label: {
                            Text("Restore")
                                .font(.caption.weight(.black))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(AppTheme.disabledFill)
                                .foregroundStyle(AppTheme.ink)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if let alternatives = alternativeCandidates, !alternatives.isEmpty {
                DisclosureGroup {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(alternatives, id: \.id) { candidate in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(candidate.name)
                                    .font(.caption.weight(.bold))
                                Text("\(candidate.artistName) - \(candidate.albumName ?? "Unknown album")")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                            .background(Color.white.opacity(0.68))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }

                        Text("Choosing a different candidate is next; for now, Approve uses the highlighted candidate above.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 8)
                } label: {
                    Text("Browse \(alternatives.count) other candidate\(alternatives.count == 1 ? "" : "s")")
                        .font(.caption.weight(.black))
                        .foregroundStyle(AppTheme.inkMuted)
                }
            }
        }
        .padding(14)
    }

    private var shouldShowActions: Bool {
        mode == .review || mode == .ready || mode == .skipped
    }

    private var alternativeCandidates: [AppleSongCandidate]? {
        guard let candidates = item.candidates, candidates.count > 1 else { return nil }
        let highlightedID = item.appleCandidate?.id
        return candidates.filter { $0.id != highlightedID }
    }

    private var statusColor: Color {
        if mode == .skipped { return AppTheme.inkMuted }
        switch item.status {
        case "matched":
            return AppTheme.spotify
        case "needs_review":
            return AppTheme.warning
        default:
            return AppTheme.danger
        }
    }
}

private struct TrackPreviewRow: View {
    let index: Int
    let track: SpotifyTrack

    var body: some View {
        HStack(spacing: 12) {
            Text(String(format: "%02d", index))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 28, alignment: .leading)
            ArtworkView(url: track.albumImageUrl, size: 48)
            VStack(alignment: .leading, spacing: 3) {
                Text(track.name)
                    .font(.headline)
                Text("\(track.artistText) - \(track.album ?? "Unknown album")")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer()
        }
        .padding(12)
    }
}

private struct MetricCard: View {
    let label: String
    let value: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption)
                .fontWeight(.black)
                .tracking(1.4)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            Text(value)
                .font(.system(size: 38, weight: .black, design: .serif))
                .italic()
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(AppTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(AppTheme.border, lineWidth: 1)
        )
    }
}

private struct ArtworkView: View {
    let url: URL?
    let size: CGFloat

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .scaledToFill()
            default:
                LinearGradient(
                    colors: [AppTheme.apple, AppTheme.spotify, .black],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.18, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 12, y: 8)
    }
}

private struct ActionButtonLabel: View {
    let title: String
    let systemImage: String
    var background: Color
    var foreground: Color = .white

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.headline.weight(.black))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .foregroundStyle(foreground)
            .background(background)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(AppTheme.line, lineWidth: 1)
            )
    }
}

private enum AppTheme {
    static let background = Color(red: 0.984, green: 0.984, blue: 0.992)
    static let card = Color.white
    static let inset = Color(red: 0.949, green: 0.949, blue: 0.961)
    static let disabledFill = Color(red: 0.918, green: 0.918, blue: 0.938)
    static let border = Color.black.opacity(0.08)
    static let line = Color.black.opacity(0.08)
    static let lineStrong = Color.black.opacity(0.14)
    static let ink = Color(red: 0.043, green: 0.043, blue: 0.051)
    static let inkSoft = Color(red: 0.227, green: 0.227, blue: 0.239)
    static let inkMuted = Color(red: 0.525, green: 0.525, blue: 0.545)
    static let spotify = Color(red: 0.114, green: 0.725, blue: 0.329)
    static let apple = Color(red: 0.980, green: 0.141, blue: 0.235)
    static let actionBlue = Color(red: 0.165, green: 0.412, blue: 0.490)
    static let warning = Color(red: 0.722, green: 0.416, blue: 0.122)
    static let danger = Color(red: 0.831, green: 0.227, blue: 0.184)
}

#if DEBUG
private struct ImportViewPreviews: PreviewProvider {
    static var previews: some View {
        ImportView()
    }
}
#endif
