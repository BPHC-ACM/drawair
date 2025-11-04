import React, { useRef, useEffect, useState } from 'react';
import { Camera, Palette, Save, Trash2, Hand, Circle } from 'lucide-react';

const AirCanvas = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingCanvasRef = useRef(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentColor, setCurrentColor] = useState('#FF0000');
  const [isEraser, setIsEraser] = useState(false);
  const [fps, setFps] = useState(0);
  const [handDetected, setHandDetected] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [error, setError] = useState('');
  
  const animationFrameRef = useRef(null);
  const lastPointRef = useRef(null);
  const lastFrameTimeRef = useRef(Date.now());
  const fpsCounterRef = useRef(0);
  const fpsUpdateTimeRef = useRef(Date.now());

  const colors = [
    { name: 'Red', value: '#FF0000', x: 20, y: 20 },
    { name: 'Blue', value: '#0000FF', x: 90, y: 20 },
    { name: 'Green', value: '#00FF00', x: 160, y: 20 },
    { name: 'Yellow', value: '#FFFF00', x: 230, y: 20 },
    { name: 'Eraser', value: '#FFFFFF', x: 300, y: 20, isEraser: true }
  ];

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsRunning(true);
        setError('');
      }
    } catch (err) {
      setError('Camera access denied. Please allow camera permissions.');
      console.error('Camera error:', err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsRunning(false);
    setHandDetected(false);
    setDrawMode(false);
  };

  const clearCanvas = () => {
    const canvas = drawingCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      lastPointRef.current = null;
    }
  };

  const saveCanvas = () => {
    const canvas = drawingCanvasRef.current;
    if (canvas) {
      const link = document.createElement('a');
      link.download = `air-canvas-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  useEffect(() => {
    const drawingCanvas = drawingCanvasRef.current;
    if (drawingCanvas) {
      const ctx = drawingCanvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    }
  }, []);

  useEffect(() => {
    let handsInstance = null;

    const loadHandTracking = async () => {
      if (!isRunning || !videoRef.current) return;

      try {
        // Dynamically load MediaPipe Hands
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
        script.async = true;
        
        script.onload = () => {
          const script2 = document.createElement('script');
          script2.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
          script2.async = true;
          
          script2.onload = () => {
            initializeHands();
          };
          
          document.body.appendChild(script2);
        };
        
        document.body.appendChild(script);
      } catch (err) {
        console.error('Failed to load hand tracking:', err);
        setError('Failed to load hand tracking libraries.');
      }
    };

    const initializeHands = () => {
      if (typeof window.Hands === 'undefined') {
        console.error('Hands not loaded');
        return;
      }

      handsInstance = new window.Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });

      handsInstance.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      });

      handsInstance.onResults(onResults);

      if (videoRef.current) {
        const camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (handsInstance && videoRef.current) {
              await handsInstance.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480
        });
        camera.start();
      }
    };

    const onResults = (results) => {
      const canvas = canvasRef.current;
      const drawingCanvas = drawingCanvasRef.current;
      const video = videoRef.current;

      if (!canvas || !drawingCanvas || !video) return;

      const ctx = canvas.getContext('2d');
      const drawCtx = drawingCanvas.getContext('2d');

      // Update FPS
      fpsCounterRef.current++;
      const now = Date.now();
      if (now - fpsUpdateTimeRef.current >= 1000) {
        setFps(fpsCounterRef.current);
        fpsCounterRef.current = 0;
        fpsUpdateTimeRef.current = now;
      }

      // Clear and draw video
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Draw toolbar
      colors.forEach((color, idx) => {
        ctx.fillStyle = color.value;
        ctx.fillRect(color.x, color.y, 60, 60);
        ctx.strokeStyle = currentColor === color.value ? '#000000' : '#666666';
        ctx.lineWidth = currentColor === color.value ? 4 : 2;
        ctx.strokeRect(color.x, color.y, 60, 60);
        
        if (color.isEraser) {
          ctx.fillStyle = '#000000';
          ctx.font = '12px Arial';
          ctx.fillText('ERASE', color.x + 10, color.y + 35);
        }
      });

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        setHandDetected(true);
        const landmarks = results.multiHandLandmarks[0];
        
        // Draw hand landmarks
        ctx.fillStyle = '#00FF00';
        landmarks.forEach((landmark) => {
          const x = canvas.width - landmark.x * canvas.width;
          const y = landmark.y * canvas.height;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, 2 * Math.PI);
          ctx.fill();
        });

        // Get index finger tip (landmark 8)
        const indexTip = landmarks[8];
        const indexMcp = landmarks[5];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];
        
        const fingerX = canvas.width - indexTip.x * canvas.width;
        const fingerY = indexTip.y * canvas.height;

        // Highlight index finger tip
        ctx.fillStyle = '#FF00FF';
        ctx.beginPath();
        ctx.arc(fingerX, fingerY, 8, 0, 2 * Math.PI);
        ctx.fill();

        // Check if only index finger is extended (drawing gesture)
        const indexExtended = indexTip.y < indexMcp.y;
        const middleFolded = middleTip.y > landmarks[10].y;
        const ringFolded = ringTip.y > landmarks[14].y;
        const pinkyFolded = pinkyTip.y > landmarks[18].y;
        
        const isDrawingGesture = indexExtended && middleFolded && ringFolded && pinkyFolded;
        setDrawMode(isDrawingGesture);

        // Check toolbar selection (when not in drawing mode)
        if (!isDrawingGesture) {
          colors.forEach((color) => {
            if (fingerX >= color.x && fingerX <= color.x + 60 &&
                fingerY >= color.y && fingerY <= color.y + 60) {
              setCurrentColor(color.value);
              setIsEraser(color.isEraser || false);
            }
          });
          lastPointRef.current = null;
        } else {
          // Drawing mode
          if (lastPointRef.current) {
            drawCtx.strokeStyle = isEraser ? '#FFFFFF' : currentColor;
            drawCtx.lineWidth = isEraser ? 20 : 5;
            drawCtx.lineCap = 'round';
            drawCtx.lineJoin = 'round';
            
            drawCtx.beginPath();
            drawCtx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
            drawCtx.lineTo(fingerX, fingerY);
            drawCtx.stroke();
          }
          lastPointRef.current = { x: fingerX, y: fingerY };
        }
      } else {
        setHandDetected(false);
        setDrawMode(false);
        lastPointRef.current = null;
      }
    };

    if (isRunning) {
      loadHandTracking();
    }

    return () => {
      if (handsInstance) {
        handsInstance.close();
      }
    };
  }, [isRunning, currentColor, isEraser]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'c' || e.key === 'C') {
        clearCanvas();
      } else if (e.key === 's' || e.key === 'S') {
        saveCanvas();
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-3 flex items-center justify-center gap-3">
            <Hand className="w-12 h-12" />
            Air Canvas
          </h1>
          <p className="text-blue-200 text-lg">Virtual Finger Painter with Real-Time Hand Tracking</p>
        </div>

        {error && (
          <div className="bg-red-500 text-white p-4 rounded-lg mb-6 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Camera className="w-5 h-5" />
                Live Camera Feed
              </h2>
              <div className="flex items-center gap-4">
                <span className="text-sm text-blue-200">FPS: {fps}</span>
                <div className="flex items-center gap-2">
                  <Circle className={`w-3 h-3 ${handDetected ? 'text-green-400 fill-green-400' : 'text-gray-400'}`} />
                  <span className="text-sm text-white">{handDetected ? 'Hand Detected' : 'No Hand'}</span>
                </div>
                {drawMode && (
                  <span className="text-sm bg-green-500 text-white px-3 py-1 rounded-full">Drawing</span>
                )}
              </div>
            </div>
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video ref={videoRef} className="hidden" />
              <canvas ref={canvasRef} width="640" height="480" className="w-full" />
            </div>
          </div>

          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Drawing Canvas
              </h2>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded border-2 border-white" style={{ backgroundColor: currentColor }} />
                <span className="text-sm text-white">{isEraser ? 'Eraser' : 'Drawing'}</span>
              </div>
            </div>
            <div className="bg-white rounded-lg overflow-hidden">
              <canvas ref={drawingCanvasRef} width="640" height="480" className="w-full" />
            </div>
          </div>
        </div>

        <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-xl p-6 shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Controls</h3>
              <div className="space-y-2">
                <button
                  onClick={isRunning ? stopCamera : startCamera}
                  className={`w-full py-3 px-6 rounded-lg font-semibold transition-all ${
                    isRunning
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                  }`}
                >
                  {isRunning ? 'Stop Camera' : 'Start Camera'}
                </button>
                <button
                  onClick={clearCanvas}
                  className="w-full py-3 px-6 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  Clear Canvas (C)
                </button>
                <button
                  onClick={saveCanvas}
                  className="w-full py-3 px-6 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  Save Drawing (S)
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-4">How to Use</h3>
              <div className="space-y-3 text-blue-100">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
                  <p className="text-sm">Click "Start Camera" to begin hand tracking</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
                  <p className="text-sm">Point at color boxes (top-left of camera) to select colors</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
                  <p className="text-sm">Extend only your index finger to draw (other fingers folded)</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">4</div>
                  <p className="text-sm">Open your hand (all fingers extended) to stop drawing and select tools</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">5</div>
                  <p className="text-sm">Press 'C' to clear or 'S' to save your artwork</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 bg-white bg-opacity-10 backdrop-blur-lg rounded-xl p-4 text-center">
          <p className="text-blue-200 text-sm">
            Built with React + MediaPipe Hands • Real-time hand tracking at {fps} FPS • Draw in mid-air with your finger!
          </p>
        </div>
      </div>
    </div>
  );
};

export default AirCanvas;