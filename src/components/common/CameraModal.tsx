import React, { useState, useRef, useEffect } from 'react';
import { Modal } from './Modal';
import { Camera, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  onCapture: (base64Image: string) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  onCapture,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const startCamera = async () => {
    setCameraError(null);
    setCapturedImage(null);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play();
        }
        setCameraActive(true);
      } else {
        setCameraError('Camera access is not supported by your browser. Please select or capture a photo file below.');
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError('Could not access live camera. Please allow camera permissions or upload a selfie photo below.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const handleSnap = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(base64);
    stopCamera();
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setCapturedImage(event.target.result as string);
          stopCamera();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="500px">
      <div style={{ textAlign: 'center' }}>
        {subtitle && (
          <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '1rem' }}>
            {subtitle}
          </p>
        )}

        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {capturedImage ? (
          <div>
            <div
              style={{
                width: '240px',
                height: '240px',
                borderRadius: '50%',
                overflow: 'hidden',
                margin: '0 auto 1rem auto',
                border: '4px solid #C5A059',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
            >
              <img
                src={capturedImage}
                alt="Captured Selfie"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '1rem' }}>
              <button onClick={handleRetake} className="btn btn-outline btn-sm">
                <RefreshCw size={14} />
                <span>Retake Photo</span>
              </button>
              <button onClick={handleConfirm} className="btn btn-gold btn-sm">
                <CheckCircle2 size={14} />
                <span>Confirm Selfie</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div
              style={{
                width: '260px',
                height: '260px',
                borderRadius: '50%',
                overflow: 'hidden',
                margin: '0 auto 1rem auto',
                border: '4px solid #0A192F',
                background: '#0A192F',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            {cameraError && (
              <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '0.75rem', borderRadius: '8px', fontSize: '0.8rem', marginBottom: '1rem' }}>
                <AlertCircle size={16} style={{ display: 'inline', marginRight: '0.35rem' }} />
                {cameraError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
              <button onClick={handleSnap} className="btn btn-gold btn-lg" style={{ width: '100%' }}>
                <Camera size={20} />
                <span>Snap Selfie Photo</span>
              </button>

              <input
                type="file"
                accept="image/*"
                capture="user"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-outline btn-sm"
              >
                Upload / Choose Photo File
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
