import SwiftUI

struct ImportView: View {
    @StateObject private var viewModel = TransferViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                hero
                importCard
                statusCard

                if let preview = viewModel.preview {
                    PlaylistPreviewCard(preview: preview)
                }

                if let analysis = viewModel.analysis {
                    MatchReportView(
                        analysis: analysis,
                        readyItems: viewModel.readyItems,
                        reviewItems: viewModel.reviewItems,
                        missingItems: viewModel.missingItems
                    )
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 28)
            .padding(.bottom, 32)
        }
        .background(AppTheme.background.ignoresSafeArea())
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

            TextField("https://open.spotify.com/playlist/...", text: $viewModel.playlistInput, axis: .vertical)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .font(.system(.body, design: .monospaced))
                .padding(14)
                .background(AppTheme.inset)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(AppTheme.lineStrong, lineWidth: 1.5)
                )

            Button {
                Task { await viewModel.previewPlaylist() }
            } label: {
                ActionButtonLabel(
                    title: "Preview public link",
                    systemImage: "arrow.right",
                    background: viewModel.canPreview ? AppTheme.spotify : AppTheme.disabledFill,
                    foreground: viewModel.canPreview ? .white : AppTheme.inkMuted
                )
            }
            .buttonStyle(.plain)
            .disabled(!viewModel.canPreview)

            Button {
                Task { await viewModel.analyzeMatches() }
            } label: {
                ActionButtonLabel(
                    title: "Analyze matches",
                    systemImage: "wand.and.stars",
                    background: viewModel.canAnalyze ? AppTheme.apple : AppTheme.disabledFill,
                    foreground: viewModel.canAnalyze ? .white : AppTheme.inkMuted
                )
            }
            .buttonStyle(.plain)
            .disabled(!viewModel.canAnalyze)
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
        return AppTheme.ink
    }

    private var statusBackground: Color {
        if case .failed = viewModel.phase { return AppTheme.danger.opacity(0.1) }
        return AppTheme.spotify.opacity(0.12)
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
                    Text("\(preview.tracks.count) readable tracks")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                }
            }

            VStack(spacing: 0) {
                ForEach(Array(preview.tracks.prefix(8).enumerated()), id: \.element.id) { index, track in
                    TrackPreviewRow(index: index + 1, track: track)
                    if index < min(preview.tracks.count, 8) - 1 {
                        Divider()
                    }
                }
            }
            .background(Color.white.opacity(0.64))
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .padding(18)
        .background(AppTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(AppTheme.border, lineWidth: 1)
        )
    }
}

private struct MatchReportView: View {
    let analysis: TransferAnalysis
    let readyItems: [TransferItem]
    let reviewItems: [TransferItem]
    let missingItems: [TransferItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Match report")
                .font(.system(size: 34, weight: .black, design: .serif))
                .italic()

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                MetricCard(label: "Ready", value: "\(analysis.summary.confidentMatchCount)", color: AppTheme.spotify)
                MetricCard(label: "Review", value: "\(analysis.summary.needsReviewCount)", color: AppTheme.warning)
                MetricCard(label: "Missing", value: "\(analysis.summary.unmatchedCount)", color: AppTheme.danger)
                MetricCard(label: "Any match", value: "\(Int((analysis.summary.matchRate * 100).rounded()))%", color: AppTheme.ink)
            }

            if !reviewItems.isEmpty {
                TransferSection(title: "Needs review", items: reviewItems)
            }

            if !missingItems.isEmpty {
                TransferSection(title: "Missing", items: missingItems)
            }

            TransferSection(title: "Ready to transfer", items: readyItems)

            VStack(alignment: .leading, spacing: 8) {
                Text("Apple Music creation is next")
                    .font(.headline)
                Text("The native MusicKit authorization and create-playlist action will plug into this saved transfer report in the next iOS milestone.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(16)
            .background(AppTheme.apple.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }
}

private struct TransferSection: View {
    let title: String
    let items: [TransferItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(title) - \(items.count)")
                .font(.caption)
                .fontWeight(.black)
                .tracking(2)
                .foregroundStyle(sectionColor)
                .textCase(.uppercase)

            VStack(spacing: 0) {
                ForEach(items.prefix(12)) { item in
                    TransferItemRow(item: item)
                    if item.id != items.prefix(12).last?.id {
                        Divider()
                    }
                }
            }
            .background(Color.white.opacity(0.72))
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
    }

    private var sectionColor: Color {
        if title.lowercased().contains("review") { return AppTheme.warning }
        if title.lowercased().contains("missing") { return AppTheme.danger }
        return AppTheme.spotify
    }
}

private struct TransferItemRow: View {
    let item: TransferItem

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
                Text(item.statusLabel)
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
        }
        .padding(14)
    }

    private var statusColor: Color {
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
