import SwiftUI

// RecordOrb — watchOS SwiftUI port of the phone's MorphOrb
// (components/recording/RecordOrb.tsx). A 5-point morphing blob with a
// Catmull-Rom cardinal spline (tension 0.18), a radial primaryHi→primary→
// secondary fill, an ambient halo, and an amplitude-reactive scale pulse.
//
// Faithful adaptation, not pixel-identical: amplitudes/frequencies match the
// spec (scaled to the orb radius so it's resolution-independent), and colors
// come from the user's palette (WatchSession), so it reads as the same orb.

struct OrbView: View {
    /// Latest mic amplitude in [0, 1].
    var amplitude: Double
    /// True while recording — switches to the livelier morph params.
    var active: Bool
    var primary: Color
    var primaryHi: Color
    var secondary: Color

    // Spec params (RecordOrb.tsx). Amps are fractions of baseR so they scale.
    private let phases: [Double] = [0, 1.1, 2.3, 4.0, 5.5]
    private let idleAmpFrac: [Double] = [0.056, 0.048, 0.065, 0.052, 0.058]
    private let activeAmpFrac: [Double] = [0.089, 0.081, 0.097, 0.084, 0.090]
    private let idleFreqs: [Double] = [0.00080, 0.00065, 0.00095, 0.00075, 0.00085]
    private let activeFreqs: [Double] = [0.0016, 0.0013, 0.0019, 0.0015, 0.0017]
    private let tension = 0.18
    private let scalePulseMax = 0.14

    @State private var start = Date()

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSince(start) * 1000 // ms
            Canvas { ctx, size in
                let center = CGPoint(x: size.width / 2, y: size.height / 2)
                let baseR = min(size.width, size.height) * 0.40
                let haloR = baseR * 1.35

                // Ambient halo — faint primary radial, static size.
                let haloRect = CGRect(
                    x: center.x - haloR, y: center.y - haloR,
                    width: haloR * 2, height: haloR * 2
                )
                ctx.fill(
                    Path(ellipseIn: haloRect),
                    with: .radialGradient(
                        Gradient(colors: [primary.opacity(0.18), primary.opacity(0)]),
                        center: center, startRadius: 0, endRadius: haloR
                    )
                )

                // Morphing body.
                let pulse = 1 + max(0, min(1, amplitude)) * scalePulseMax
                var pts: [CGPoint] = []
                for i in 0..<5 {
                    let angle = Double(i) / 5.0 * 2 * .pi
                    let amp = baseR * (active ? activeAmpFrac[i] : idleAmpFrac[i])
                    let freq = active ? activeFreqs[i] : idleFreqs[i]
                    let wob = sin(t * freq + phases[i]) * amp
                    let r = (baseR + wob) * pulse
                    pts.append(CGPoint(
                        x: center.x + cos(angle) * r,
                        y: center.y + sin(angle) * r
                    ))
                }

                let body = Self.closedCatmullRom(pts, tension: tension)
                ctx.fill(
                    body,
                    with: .radialGradient(
                        Gradient(stops: [
                            .init(color: primaryHi, location: 0),
                            .init(color: primary, location: 0.55),
                            .init(color: secondary, location: 1),
                        ]),
                        center: CGPoint(x: center.x - baseR * 0.12, y: center.y - baseR * 0.16),
                        startRadius: 0, endRadius: baseR * 1.15
                    )
                )
            }
        }
        .onAppear { start = Date() }
    }

    /// Closed cardinal spline through `pts` as cubic Béziers (matches the RN
    /// Catmull-Rom → Bézier conversion at the given tension).
    private static func closedCatmullRom(_ pts: [CGPoint], tension: Double) -> Path {
        var path = Path()
        guard pts.count >= 3 else { return path }
        let n = pts.count
        path.move(to: pts[0])
        for i in 0..<n {
            let p0 = pts[(i - 1 + n) % n]
            let p1 = pts[i]
            let p2 = pts[(i + 1) % n]
            let p3 = pts[(i + 2) % n]
            let c1 = CGPoint(
                x: p1.x + (p2.x - p0.x) * tension,
                y: p1.y + (p2.y - p0.y) * tension
            )
            let c2 = CGPoint(
                x: p2.x - (p3.x - p1.x) * tension,
                y: p2.y - (p3.y - p1.y) * tension
            )
            path.addCurve(to: p2, control1: c1, control2: c2)
        }
        path.closeSubpath()
        return path
    }
}
