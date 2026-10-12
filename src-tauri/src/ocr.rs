//! Reads the text in an image with Apple's on-device text recognition (Vision). Nothing leaves the Mac.

#[cfg(target_os = "macos")]
pub fn read_image(bytes: &[u8]) -> Result<String, String> {
    use objc2::rc::autoreleasepool;
    use objc2::AnyThread;
    use objc2_foundation::{NSArray, NSData, NSDictionary};
    use objc2_vision::{VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel};

    autoreleasepool(|_| {
        let data = NSData::with_bytes(bytes);
        let handler = VNImageRequestHandler::initWithData_options(VNImageRequestHandler::alloc(), &data, &NSDictionary::new());

        let request = VNRecognizeTextRequest::new();
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        request.setUsesLanguageCorrection(true);
        // Documents mix Spanish, English, Arabic…: let Vision pick the language per line.
        request.setAutomaticallyDetectsLanguage(true);

        let as_request: &VNRequest = &request;
        let requests = NSArray::from_slice(&[as_request]);
        handler.performRequests_error(&requests).map_err(|e| e.localizedDescription().to_string())?;

        let mut lines = Vec::new();
        if let Some(results) = request.results() {
            for observation in results.iter() {
                if let Some(best) = observation.topCandidates(1).firstObject() {
                    lines.push(best.string().to_string());
                }
            }
        }
        Ok(lines.join("\n"))
    })
}

#[cfg(not(target_os = "macos"))]
pub fn read_image(_bytes: &[u8]) -> Result<String, String> {
    Err("Reading photos needs macOS for now.".into())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    /// Set OCR_SAMPLE to an image path to run: OCR_SAMPLE=/path/to.png cargo test reads_sample -- --nocapture
    #[test]
    fn reads_sample() {
        let Ok(path) = std::env::var("OCR_SAMPLE") else { return };
        let text = super::read_image(&std::fs::read(path).unwrap()).unwrap();
        println!("{text}");
        assert!(!text.trim().is_empty());
    }
}
