import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct ImportView: View {
    @Environment(\.openURL) private var openURL
    @ObservedObject var viewModel: TransferViewModel
    @FocusState private var playlistFieldFocused: Bool
    @FocusState private var destinationFieldFocused: Bool
    @State private var isReadingClipboard = false

    var body: some View {
        ScrollViewReader { scrollProxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    hero
                    importCard

                    if let activity = viewModel.activity {
                        ActivityCard(activity: activity)
                            .id("activity")
                    } else if shouldShowStatusCard {
                        statusCard
                    }

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
                            restoreTrack: viewModel.restoreTrack,
                            selectedCandidate: viewModel.selectedCandidate,
                            selectCandidate: viewModel.selectCandidate
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
            .onChange(of: viewModel.phase) { _, phase in
                if phase == .previewing || phase == .analyzing || phase == .creating {
                    playlistFieldFocused = false
                    destinationFieldFocused = false
                }

                if phase == .previewReady {
                    playlistFieldFocused = false
                    destinationFieldFocused = false
                    withAnimation(.snappy(duration: 0.35)) {
                        scrollProxy.scrollTo("preview", anchor: .top)
                    }
                }

                if phase == .analysisReady {
                    playlistFieldFocused = false
                    destinationFieldFocused = false
                    withAnimation(.snappy(duration: 0.35)) {
                        scrollProxy.scrollTo("report", anchor: .top)
                    }
                }
            }
            .onChange(of: viewModel.activity) { _, activity in
                guard activity != nil else { return }
                playlistFieldFocused = false
                destinationFieldFocused = false
                withAnimation(.snappy(duration: 0.35)) {
                    scrollProxy.scrollTo("activity", anchor: .top)
                }
            }
            #if DEBUG
            .onAppear {
                guard let screenshotScrollTarget else { return }
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 450_000_000)
                    scrollProxy.scrollTo(screenshotScrollTarget, anchor: .top)
                }
            }
            #endif
            .animation(.snappy(duration: 0.25), value: viewModel.phase)
            .animation(.snappy(duration: 0.25), value: viewModel.activity)
        }
    }

    #if DEBUG
    private var screenshotScrollTarget: String? {
        ProcessInfo.processInfo.arguments
            .compactMap { argument -> String? in
                guard argument.hasPrefix("--screenshot-scroll=") else { return nil }
                return String(argument.dropFirst("--screenshot-scroll=".count))
            }
            .first
    }
    #endif

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

            Text("Move Spotify playlists or individual songs into Apple Music. We preview the link first and show the match before anything is added.")
                .font(.body)
                .foregroundStyle(AppTheme.inkSoft)
        }
    }

    private var importCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Spotify playlist or song URL", systemImage: "link")
                .font(.caption)
                .fontWeight(.black)
                .tracking(1.8)
                .foregroundStyle(AppTheme.spotify)
                .textCase(.uppercase)

            HStack(spacing: 8) {
                TextField("Paste a Spotify playlist or song link", text: $viewModel.playlistInput)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .submitLabel(.go)
                    .font(.system(.body, design: .monospaced))
                    .lineLimit(1)
                    .focused($playlistFieldFocused)
                    .onSubmit {
                        submitPreview()
                    }

                if viewModel.playlistInput.isEmpty {
                    Button {
                        pasteSpotifyLink()
                    } label: {
                        Label(isReadingClipboard ? "Pasting" : "Paste", systemImage: "doc.on.clipboard")
                            .font(.caption.weight(.black))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(AppTheme.spotify.opacity(0.12))
                            .foregroundStyle(AppTheme.spotify)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(isReadingClipboard)
                    .accessibilityLabel("Paste Spotify link")
                } else {
                    Button {
                        viewModel.reset()
                        playlistFieldFocused = true
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title3)
                            .foregroundStyle(AppTheme.inkMuted)
                            .accessibilityLabel("Clear Spotify playlist URL")
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(14)
            .background(AppTheme.card)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(AppTheme.lineStrong, lineWidth: 1.5)
            )

            Button {
                submitPreview()
            } label: {
                ActionButtonLabel(
                    title: viewModel.preview == nil ? "Preview Spotify link" : "Refresh Spotify link",
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
        destinationFieldFocused = false
        Task { await viewModel.previewPlaylist() }
    }

    private func pasteSpotifyLink() {
        #if canImport(UIKit)
        guard !isReadingClipboard else { return }
        isReadingClipboard = true
        playlistFieldFocused = false
        destinationFieldFocused = false

        Task {
            let clipboardText = await ClipboardTextReader.readTrimmedString()
            isReadingClipboard = false

            guard let clipboardText, !clipboardText.isEmpty else {
                playlistFieldFocused = true
                return
            }

            viewModel.replaceSpotifyInput(with: clipboardText)
        }
        #else
        playlistFieldFocused = true
        #endif
    }

    private var shouldShowStatusCard: Bool {
        switch viewModel.phase {
        case .idle, .previewing, .analyzing, .creating:
            return false
        default:
            return !viewModel.statusMessage.isEmpty
        }
    }

    private var statusCard: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: statusIcon)
                .font(.headline.weight(.black))
                .foregroundStyle(statusColor)
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

    private var statusIcon: String {
        if case .failed = viewModel.phase { return "exclamationmark.triangle.fill" }
        if case .created = viewModel.phase { return "checkmark.circle.fill" }
        return "info.circle.fill"
    }

    private var shouldShowStickyStatus: Bool {
        if viewModel.isBusy || viewModel.createdPlaylist != nil { return true }
        if case .failed = viewModel.phase { return true }
        return false
    }

    @ViewBuilder
    private var bottomActionBar: some View {
        if (viewModel.preview != nil || viewModel.analysis != nil) && !viewModel.isBusy {
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
                    Text(viewModel.pendingSyncItems.isEmpty
                        ? (viewModel.isSingleTrackImport ? "Song added" : "\(createdPlaylist.trackCount) tracks transferred")
                        : "\(viewModel.pendingSyncItems.count) new \(viewModel.pendingSyncItems.count == 1 ? "match" : "matches") ready")
                        .font(.caption.weight(.black))
                        .tracking(1.8)
                        .foregroundStyle(AppTheme.inkMuted)
                        .textCase(.uppercase)

                    if viewModel.pendingSyncItems.isEmpty {
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
                    } else {
                        Button {
                            playlistFieldFocused = false
                            destinationFieldFocused = false
                            Task { await viewModel.updateCreatedAppleMusicPlaylist() }
                        } label: {
                            ActionButtonLabel(
                                title: "Update Apple Music playlist",
                                systemImage: "arrow.triangle.2.circlepath",
                                background: viewModel.canUpdateCreatedPlaylist ? AppTheme.apple : AppTheme.disabledFill,
                                foreground: viewModel.canUpdateCreatedPlaylist ? .white : AppTheme.inkMuted
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(!viewModel.canUpdateCreatedPlaylist)
                    }
                } else if viewModel.analysis != nil {
                    if !viewModel.isSingleTrackImport {
                        DestinationPlaylistNameInlineEditor(
                            playlistName: $viewModel.destinationPlaylistName,
                            resetName: viewModel.resetDestinationPlaylistName,
                            isFocused: $destinationFieldFocused
                        )
                    }

                    Text(viewModel.isSingleTrackImport ? "Song ready" : "\(viewModel.readyItems.count) ready tracks")
                        .font(.caption.weight(.black))
                        .tracking(1.8)
                        .foregroundStyle(AppTheme.inkMuted)
                        .textCase(.uppercase)

                    Button {
                        playlistFieldFocused = false
                        destinationFieldFocused = false
                        Task { await viewModel.createAppleMusicPlaylist() }
                    } label: {
                        ActionButtonLabel(
                            title: viewModel.isSingleTrackImport
                                ? "Add to Apple Music"
                                : "Create Apple Music playlist",
                            systemImage: viewModel.isSingleTrackImport ? "music.note.badge.plus" : "music.note.list",
                            background: viewModel.canCreate ? AppTheme.apple : AppTheme.disabledFill,
                            foreground: viewModel.canCreate ? .white : AppTheme.inkMuted
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(!viewModel.canCreate)
                } else {
                    Text(viewModel.isSingleTrackImport ? "Song preview loaded" : "Playlist preview loaded")
                        .font(.caption.weight(.black))
                        .tracking(1.8)
                        .foregroundStyle(AppTheme.inkMuted)
                        .textCase(.uppercase)

                    Button {
                        playlistFieldFocused = false
                        Task { await viewModel.analyzeMatches() }
                    } label: {
                        ActionButtonLabel(
                            title: viewModel.isSingleTrackImport ? "Find on Apple Music" : "Match with Apple Music",
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

#if canImport(UIKit)
private enum ClipboardTextReader {
    static func readTrimmedString() async -> String? {
        await Task.detached(priority: .userInitiated) {
            UIPasteboard.general.string?.trimmingCharacters(in: .whitespacesAndNewlines)
        }.value
    }
}
#endif

private struct ActivityCard: View {
    let activity: TransferActivity

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label(activity.eyebrow, systemImage: iconName)
                .font(.caption)
                .fontWeight(.black)
                .tracking(1.7)
                .foregroundStyle(accent)
                .textCase(.uppercase)

            VStack(alignment: .leading, spacing: 8) {
                Text(activity.title)
                    .font(.system(size: 28, weight: .black, design: .serif))
                    .italic()
                    .foregroundStyle(AppTheme.ink)

                Text(activity.detail)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.inkSoft)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Progress")
                        .font(.caption.weight(.black))
                        .tracking(1.4)
                        .foregroundStyle(AppTheme.inkMuted)
                        .textCase(.uppercase)
                    Spacer()
                    Text(activity.progressText)
                        .font(.caption.weight(.black).monospacedDigit())
                        .foregroundStyle(accent)
                }

                ProgressView(value: Double(activity.progress), total: 100)
                    .tint(accent)
                    .scaleEffect(x: 1, y: 1.7, anchor: .center)
            }
        }
        .padding(18)
        .background(
            LinearGradient(
                colors: [accent.opacity(0.16), AppTheme.card],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(accent.opacity(0.24), lineWidth: 1)
        )
    }

    private var accent: Color {
        switch activity.kind {
        case .preview:
            return AppTheme.spotify
        case .analysis:
            return AppTheme.actionBlue
        case .create:
            return AppTheme.apple
        }
    }

    private var iconName: String {
        switch activity.kind {
        case .preview:
            return "link"
        case .analysis:
            return "wand.and.stars"
        case .create:
            return "music.note.list"
        }
    }
}

private struct BrandMark: View {
    let size: CGFloat

    var body: some View {
        Image("BrandMark")
            .resizable()
            .interpolation(.high)
            .scaledToFit()
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
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
                    Text(preview.playlist.kind == "track" ? "Public Spotify song" : "Public Spotify playlist")
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
                if !showsAllTracks {
                    Text("Showing the first \(collapsedTrackLimit) tracks here to keep the preview readable. The match report still uses the full selected review mode.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.inkMuted)
                }

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
        if preview.playlist.kind == "track" {
            return "Ready to find on Apple Music"
        }

        let total = preview.playlist.totalItems ?? preview.tracks.count
        if total > preview.tracks.count {
            return "\(preview.tracks.count) readable tracks fetched from \(total) total"
        }

        return "\(preview.tracks.count) of \(total) tracks loaded"
    }
}

private struct DestinationPlaylistNameInlineEditor: View {
    @Binding var playlistName: String
    let resetName: () -> Void
    var isFocused: FocusState<Bool>.Binding

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Label("Apple Music playlist name", systemImage: "music.note")
                .font(.caption2.weight(.black))
                .tracking(1.3)
                .foregroundStyle(AppTheme.apple)
                .textCase(.uppercase)

            HStack(spacing: 8) {
                TextField("Playlist name", text: $playlistName)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .font(.subheadline.weight(.black))
                    .lineLimit(1)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(AppTheme.card)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(AppTheme.apple.opacity(0.20), lineWidth: 1)
                    )
                    .focused(isFocused)
                    .onSubmit {
                        isFocused.wrappedValue = false
                    }

                Button {
                    resetName()
                    isFocused.wrappedValue = false
                } label: {
                    Text("Reset")
                        .font(.caption2.weight(.black))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(AppTheme.disabledFill)
                        .foregroundStyle(AppTheme.ink)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }

            Text("Final name before creation. Cover art is generated by Apple Music.")
                .font(.caption2)
                .foregroundStyle(AppTheme.inkMuted)
        }
        .padding(12)
        .background(AppTheme.apple.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(AppTheme.apple.opacity(0.16), lineWidth: 1)
        )
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
    let selectedCandidate: (TransferItem) -> AppleSongCandidate?
    let selectCandidate: (AppleSongCandidate, TransferItem) -> Void

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
                    restoreTrack: restoreTrack,
                    selectedCandidate: selectedCandidate,
                    selectCandidate: selectCandidate
                )
            }

            if !missingItems.isEmpty {
                TransferSection(
                    title: "Missing",
                    items: missingItems,
                    mode: .missing,
                    approveSuggestedMatch: approveSuggestedMatch,
                    skipTrack: skipTrack,
                    restoreTrack: restoreTrack,
                    selectedCandidate: selectedCandidate,
                    selectCandidate: selectCandidate
                )
            }

            TransferSection(
                title: "Ready to transfer",
                items: readyItems,
                mode: .ready,
                approveSuggestedMatch: approveSuggestedMatch,
                skipTrack: skipTrack,
                restoreTrack: restoreTrack,
                selectedCandidate: selectedCandidate,
                selectCandidate: selectCandidate
            )

            if !skippedItems.isEmpty {
                TransferSection(
                    title: "Skipped",
                    items: skippedItems,
                    mode: .skipped,
                    approveSuggestedMatch: approveSuggestedMatch,
                    skipTrack: skipTrack,
                    restoreTrack: restoreTrack,
                    selectedCandidate: selectedCandidate,
                    selectCandidate: selectCandidate
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
    let selectedCandidate: (TransferItem) -> AppleSongCandidate?
    let selectCandidate: (AppleSongCandidate, TransferItem) -> Void

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
                        restoreTrack: restoreTrack,
                        selectedCandidate: selectedCandidate(item),
                        selectCandidate: { candidate in
                            selectCandidate(candidate, item)
                        }
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
    let selectedCandidate: AppleSongCandidate?
    let selectCandidate: (AppleSongCandidate) -> Void

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

                Text(confidenceLabel)
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            HStack {
                Text(statusLabel)
                    .font(.caption.weight(.black))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(statusColor.opacity(0.16))
                    .foregroundStyle(statusColor)
                    .clipShape(Capsule())
            }

            if let candidate = selectedCandidate {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Selected Apple Music candidate")
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
                            Text("Use suggested match")
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
                            Label(mode == .ready ? "Wrong match?" : "Skip this track", systemImage: "questionmark.circle")
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
                            VStack(alignment: .leading, spacing: 8) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(candidate.name)
                                        .font(.caption.weight(.bold))
                                    Text("\(candidate.artistName) - \(candidate.albumName ?? "Unknown album")")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }

                                Button {
                                    selectCandidate(candidate)
                                } label: {
                                    Label("Add this match", systemImage: "plus.circle.fill")
                                        .font(.caption.weight(.black))
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 8)
                                        .background(AppTheme.spotify)
                                        .foregroundStyle(.white)
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .background(Color.white.opacity(0.68))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
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

    private var statusLabel: String {
        if mode == .skipped { return "Skipped" }
        if mode == .ready && item.status != "matched" { return "Ready - Manual match" }
        if mode == .ready { return "Ready" }
        return item.statusLabel
    }

    private var confidenceLabel: String {
        if mode == .ready && item.status != "matched" { return "Manual" }
        return item.confidencePercent
    }

    private var alternativeCandidates: [AppleSongCandidate]? {
        guard let candidates = item.candidates, candidates.count > 1 else { return nil }
        let highlightedID = selectedCandidate?.id ?? item.appleCandidate?.id
        return candidates.filter { $0.id != highlightedID }
    }

    private var statusColor: Color {
        if mode == .skipped { return AppTheme.inkMuted }
        if mode == .ready { return AppTheme.spotify }
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
        ImportView(viewModel: TransferViewModel())
    }
}
#endif
