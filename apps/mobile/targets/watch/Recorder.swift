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

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
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
        rec.record()

        recorder = rec
        fileURL = url
        elapsed = 0
        isRecording = true
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.elapsed += 1 }
        }
    }

    /// Stop and return the recorded file + duration in seconds.
    @discardableResult
    func stop() -> (url: URL, duration: Int)? {
        timer?.invalidate()
        timer = nil
        recorder?.stop()
        isRecording = false
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
