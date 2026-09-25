import AVFoundation
import Foundation

// On-wrist audio capture → AAC .m4a (same container the phone uploads). The
// watch grants the mic to a foreground app, so recording here is first-class
// (unlike an iPhone App Intent, which can't get the mic out of process).
//
// Requires NSMicrophoneUsageDescription on the watch target (set via the
// target's Info plist in the config plugin / expo-target). UNVERIFIED on-device.

@MainActor
final class Recorder: NSObject, ObservableObject {
    @Published private(set) var isRecording = false
    @Published private(set) var elapsed: Int = 0
    /// Smoothed mic level in [0, 1] — drives the record orb's pulse.
    @Published private(set) var amplitude: Double = 0

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var startedAt: Date?
    private(set) var fileURL: URL?

    func requestPermission() async -> Bool {
        await withCheckedContinuation { cont in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                cont.resume(returning: granted)
            }
        }
    }

    func start() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .default)
        try session.setActive(true)

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("debrief-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 22_050,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]
        let rec = try AVAudioRecorder(url: url, settings: settings)
        rec.isMeteringEnabled = true
        rec.record()

        recorder = rec
        fileURL = url
        elapsed = 0
        amplitude = 0
        startedAt = Date()
        isRecording = true
        // 20 Hz: refresh the orb's amplitude and the elapsed seconds.
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func tick() {
        guard let rec = recorder, let startedAt else { return }
        elapsed = Int(Date().timeIntervalSince(startedAt))
        rec.updateMeters()
        // averagePower is dBFS (~ -160...0). Map -50...0 dB → 0...1, then
        // ease so quiet speech still nudges the orb without noise floor jitter.
        let power = Double(rec.averagePower(forChannel: 0))
        let norm = max(0, min(1, (power + 50) / 50))
        let eased = pow(norm, 1.5)
        // Light smoothing toward the new level.
        amplitude += (eased - amplitude) * 0.4
    }

    /// Stop and return the recorded file + duration in seconds.
    @discardableResult
    func stop() -> (url: URL, duration: Int)? {
        timer?.invalidate()
        timer = nil
        recorder?.stop()
        isRecording = false
        amplitude = 0
        startedAt = nil
        try? AVAudioSession.sharedInstance().setActive(false)
        guard let url = fileURL else { return nil }
        return (url, elapsed)
    }

    func cleanup() {
        if let url = fileURL { try? FileManager.default.removeItem(at: url) }
        fileURL = nil
        elapsed = 0
    }
}
