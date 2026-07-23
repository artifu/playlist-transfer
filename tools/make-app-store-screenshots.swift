import AppKit
import ImageIO
import UniformTypeIdentifiers

private struct Slide {
    let source: String
    let output: String
    let headline: String
    let subheadline: String
    let accent: NSColor
}

private let canvasSize = NSSize(width: 1320, height: 2868)
private let inputDirectory = "artifacts/app-store-screenshots-6.9"
private let outputDirectory = "artifacts/app-store-final-6.9"

private let slides = [
    Slide(
        source: "02-preview.png",
        output: "01-free-unlimited.png",
        headline: "100% free.\nUnlimited transfers.",
        subheadline: "Move Spotify playlists and songs to Apple Music. No Spotify login. No paid tier.",
        accent: NSColor(calibratedRed: 0.10, green: 0.75, blue: 0.34, alpha: 1)
    ),
    Slide(
        source: "02-preview.png",
        output: "02-paste-public-link.png",
        headline: "Paste any public\nSpotify link.",
        subheadline: "Preview a playlist or individual song before anything is added.",
        accent: NSColor(calibratedRed: 0.10, green: 0.75, blue: 0.34, alpha: 1)
    ),
    Slide(
        source: "03-matching.png",
        output: "03-watch-the-match.png",
        headline: "Watch every\nmatch happen.",
        subheadline: "PlaylistXfer searches Apple Music and keeps the progress clear.",
        accent: NSColor(calibratedRed: 0.13, green: 0.43, blue: 0.53, alpha: 1)
    ),
    Slide(
        source: "04-match-report.png",
        output: "04-review-first.png",
        headline: "Review before\nyou transfer.",
        subheadline: "See what is ready, check uncertain matches, and approve the result.",
        accent: NSColor(calibratedRed: 1.00, green: 0.16, blue: 0.26, alpha: 1)
    ),
    Slide(
        source: "05-created.png",
        output: "05-created.png",
        headline: "Done. Your playlist\nis in Apple Music.",
        subheadline: "A clear result with no PlaylistXfer subscription or upgrade screen.",
        accent: NSColor(calibratedRed: 0.10, green: 0.75, blue: 0.34, alpha: 1)
    ),
    Slide(
        source: "06-single-track-add.png",
        output: "06-add-one-song.png",
        headline: "One song?\nAdd it in one tap.",
        subheadline: "Individual songs go neatly into your PlaylistXfer Inbox playlist.",
        accent: NSColor(calibratedRed: 1.00, green: 0.16, blue: 0.26, alpha: 1)
    )
]

private func rect(top: CGFloat, left: CGFloat, width: CGFloat, height: CGFloat) -> NSRect {
    NSRect(x: left, y: canvasSize.height - top - height, width: width, height: height)
}

private func drawText(
    _ value: String,
    in textRect: NSRect,
    font: NSFont,
    color: NSColor,
    lineSpacing: CGFloat = 0
) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineBreakMode = .byWordWrapping
    paragraph.lineSpacing = lineSpacing
    value.draw(
        with: textRect,
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: paragraph
        ]
    )
}

private func render(_ slide: Slide) throws {
    guard let screenshot = NSImage(contentsOfFile: "\(inputDirectory)/\(slide.source)") else {
        throw NSError(domain: "PlaylistXferScreenshots", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "Could not read \(slide.source)"
        ])
    }

    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(canvasSize.width),
        pixelsHigh: Int(canvasSize.height),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 32
    ) else {
        throw NSError(domain: "PlaylistXferScreenshots", code: 2)
    }

    guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        throw NSError(domain: "PlaylistXferScreenshots", code: 3)
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context

    NSColor(calibratedRed: 0.975, green: 0.965, blue: 0.94, alpha: 1).setFill()
    NSBezierPath(rect: NSRect(origin: .zero, size: canvasSize)).fill()

    slide.accent.withAlphaComponent(0.09).setFill()
    NSBezierPath(ovalIn: NSRect(x: 930, y: 2310, width: 610, height: 610)).fill()
    slide.accent.withAlphaComponent(0.06).setFill()
    NSBezierPath(ovalIn: NSRect(x: -260, y: -220, width: 720, height: 720)).fill()

    let eyebrow = "PLAYLISTXFER  •  SPOTIFY → APPLE MUSIC"
    drawText(
        eyebrow,
        in: rect(top: 78, left: 112, width: 1096, height: 44),
        font: NSFont.systemFont(ofSize: 27, weight: .bold),
        color: slide.accent
    )

    let displayFont = NSFont(name: "NewYork-Bold", size: 77)
        ?? NSFont.systemFont(ofSize: 77, weight: .heavy)
    drawText(
        slide.headline,
        in: rect(top: 132, left: 112, width: 1096, height: 210),
        font: displayFont,
        color: NSColor(calibratedWhite: 0.04, alpha: 1),
        lineSpacing: -5
    )
    drawText(
        slide.subheadline,
        in: rect(top: 355, left: 112, width: 1096, height: 110),
        font: NSFont.systemFont(ofSize: 31, weight: .medium),
        color: NSColor(calibratedWhite: 0.22, alpha: 1),
        lineSpacing: 4
    )

    func drawScreenshot(_ image: NSImage, in screenshotRect: NSRect, topCrop: CGFloat = 0) {
        let radius = min(54, screenshotRect.width * 0.055)
        let roundedRect = NSBezierPath(roundedRect: screenshotRect, xRadius: radius, yRadius: radius)

        NSGraphicsContext.saveGraphicsState()
        let shadow = NSShadow()
        shadow.shadowColor = NSColor.black.withAlphaComponent(0.18)
        shadow.shadowBlurRadius = 30
        shadow.shadowOffset = NSSize(width: 0, height: -10)
        shadow.set()
        NSColor.white.setFill()
        roundedRect.fill()
        NSGraphicsContext.restoreGraphicsState()

        NSGraphicsContext.saveGraphicsState()
        roundedRect.addClip()
        let cropScale = image.size.height / (image.size.height - topCrop)
        let imageRect = NSRect(
            x: screenshotRect.midX - (screenshotRect.width * cropScale / 2),
            y: screenshotRect.minY,
            width: screenshotRect.width * cropScale,
            height: screenshotRect.height * cropScale
        )
        image.draw(
            in: imageRect,
            from: NSRect(origin: .zero, size: image.size),
            operation: .sourceOver,
            fraction: 1,
            respectFlipped: true,
            hints: [.interpolation: NSImageInterpolation.high]
        )
        NSGraphicsContext.restoreGraphicsState()
    }

    if slide.output == "01-free-unlimited.png" {
        guard let songScreenshot = NSImage(contentsOfFile: "\(inputDirectory)/06-single-track-add.png") else {
            throw NSError(domain: "PlaylistXferScreenshots", code: 9)
        }
        drawScreenshot(screenshot, in: NSRect(x: 40, y: 450, width: 760, height: 1652))
        drawScreenshot(songScreenshot, in: NSRect(x: 520, y: 110, width: 760, height: 1652))
    } else {
        let screenshotRect = NSRect(x: 130, y: 36, width: 1060, height: 2302)
        let topCrop: CGFloat = slide.source == "04-match-report.png" ? 125 : 0
        drawScreenshot(screenshot, in: screenshotRect, topCrop: topCrop)
    }

    NSGraphicsContext.restoreGraphicsState()

    guard let renderedImage = bitmap.cgImage else {
        throw NSError(domain: "PlaylistXferScreenshots", code: 4)
    }
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let opaqueContext = CGContext(
        data: nil,
        width: Int(canvasSize.width),
        height: Int(canvasSize.height),
        bitsPerComponent: 8,
        bytesPerRow: Int(canvasSize.width) * 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else {
        throw NSError(domain: "PlaylistXferScreenshots", code: 5)
    }
    opaqueContext.draw(renderedImage, in: CGRect(origin: .zero, size: canvasSize))
    guard let opaqueImage = opaqueContext.makeImage() else {
        throw NSError(domain: "PlaylistXferScreenshots", code: 6)
    }

    let outputURL = URL(fileURLWithPath: "\(outputDirectory)/\(slide.output)")
    guard let destination = CGImageDestinationCreateWithURL(
        outputURL as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
    ) else {
        throw NSError(domain: "PlaylistXferScreenshots", code: 7)
    }
    CGImageDestinationAddImage(destination, opaqueImage, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw NSError(domain: "PlaylistXferScreenshots", code: 8)
    }
}

try FileManager.default.createDirectory(
    atPath: outputDirectory,
    withIntermediateDirectories: true
)

for slide in slides {
    try render(slide)
    print("Created \(outputDirectory)/\(slide.output)")
}
