import "./style.css";
import { drawFrame } from "./shader";
import { useReactive } from "./reactive";
import { MP4Demuxer, MP4Muxer, stream2buffer } from "./mp4-utils";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = /* html */ `
  <div>
    <h1>WebCodecs Demo</h1>
    <p>提示：仅支持 mp4，请使用 Chrome，目前 Firefox 对该 API 支持仍不足</p>
    <input type='file' id='file' accept='video/mp4' style="${
		/* css */ `
        display: none;
      `
	}" />
    <div style="display:flex;gap:10px;justify-content:center;">
      <button id='add'>导入视频</button><div id='container'></div>
    </div>
    <br />
    <canvas id='canvas' width='640' height='360' style="${
		/* css */ `margin-top: 20px;
    background-color: #000;
    `
	}"></canvas>
  </div>
`;

let videoFrames: VideoFrame[] = [];
let videoFrameQueue: VideoFrame[] = [];
let videoLoaded = useReactive({ obj: false });
let isPlaying = false;

// 视频导入：包含解封装和解码
document
	.querySelector<HTMLButtonElement>("#add")!
	.addEventListener("click", async () => {
		const fileInput = document.querySelector<HTMLInputElement>("#file")!;
		fileInput.click();
		fileInput.addEventListener("change", async () => {
			videoFrames = [];
			const file = fileInput.files![0];

			// 实例化一个 MP4Demuxer，用于解封装
			new MP4Demuxer(file, {
				onConfig(config) {
					// 1. 配置解码器
					console.log("config", config);
					decoder.configure(config);
				},
				onChunk(chunk) {
					// 2. 解码视频帧
					console.log("chunk", chunk);
					decoder.decode(chunk);
				},
				onDone() {
					// 4.视频解封装完成
					videoLoaded.obj = true;
				},
			});

			const decoder = new VideoDecoder({
				output: (chunk) => {
					// 3. 将解码后的视频帧存入 videoFrames
					// 从GPU内存中Copy出来，及时关闭原来的，防止显存炸裂
					videoFrames.push(chunk.clone());
					chunk.close();
				},
				error: (error) => {
					console.error(error);
				},
			});
		});
	});

/**
 * 解码后渲染的元素
 */
export function render() {
	// 渲染按钮
	document.getElementById("container")!.innerHTML = /* html */ `
			<button id='play'>播放视频</button>
			<button id='export'>导出视频</button>
		`;

	// 播放
	document
		.querySelector<HTMLButtonElement>("#play")!
		.addEventListener("click", () => {
			const canvas =
				document.querySelector<HTMLCanvasElement>("#canvas")!;
			const gl = canvas.getContext("webgl2")!;
			if (!gl) {
				console.error(
					"Unable to initialize WebGL2. Your browser may not support it."
				);
				return;
			}
			if (isPlaying) {
				return;
			}
			isPlaying = true;
			let index = 0;
			let start: number | null = null;
			let fps = 24; // 目标帧率
			let interval = 1000 / fps; // 每帧间隔时间

			function animate(timestamp: number) {
				if (!start) start = timestamp;
				let elapsed = timestamp - start;

				if (elapsed > interval) {
					start = timestamp - (elapsed % interval);
					if (index < videoFrames.length) {
						play();
					} else {
						isPlaying = false;
					}
				}
				requestAnimationFrame(animate);
			}

			const play = async () => {
				const frame = videoFrames[index];
				drawFrame(gl, frame, index, videoFrames.length);
				index++;
			};

			requestAnimationFrame(animate);
		});

	// 导出
	document
		.querySelector<HTMLButtonElement>("#export")!
		.addEventListener("click", async () => {
			const mp4Muxer = new MP4Muxer();
			let track_id = -1;
			const encoder = new VideoEncoder({
				output: async (chunk, meta) => {
					if (track_id < 1 && meta != null) {
						const videoMuxConfig = {
							timescale: 1e6,
							width: 1920,
							height: 1080,
							// meta 来原于 VideoEncoder output 的参数
							avcDecoderConfigRecord:
								meta?.decoderConfig?.description,
						};
						console.log("add track", videoMuxConfig);
						track_id = mp4Muxer.addTrack(videoMuxConfig);
					}
					console.log("add video chunk", chunk);
					mp4Muxer.addVideoChunk(track_id, chunk);
				},
				error: (error) => {
					console.error(error);
				},
			});
			encoder.configure({
				codec: "avc1.4D0032",
				width: 1920,
				height: 1080,
				bitrate: 25000000,
				framerate: 24,
			});
			const renderCanvas = new OffscreenCanvas(1920, 1080);
			const renderCtx = renderCanvas.getContext("webgl2");
			if (!renderCtx) {
				console.error(
					"Unable to initialize WebGL2. Your browser may not support it."
				);
				return;
			}
			let index = 0;
			let timeoffset = 0;
			let interval = 1000 / 24;
			const renderFrame = async () => {
				if (index < videoFrames.length) {
					const frame = videoFrames[index];
					drawFrame(renderCtx, frame, index, videoFrames.length);
					const duration = interval * 1000;
					const queuedFrame = new VideoFrame(renderCanvas, {
						duration,
						timestamp: timeoffset,
					});
					encoder.encode(queuedFrame);
					timeoffset += duration;
					index++;
				} else {
					clearInterval(renderInterval);
					await encoder.flush();
					videoFrameQueue.forEach((frame) => frame.close());
					videoFrameQueue = [];
					let stream = mp4Muxer.mp4file2stream(1);
					const buffer = await stream2buffer(stream.stream);
					const blob = new Blob([buffer], { type: "video/mp4" });
					const url = URL.createObjectURL(blob);
					const a = document.createElement("a");
					a.href = url;
					a.download = "video.mp4";
					a.click();
				}
			};
			const renderInterval = setInterval(renderFrame, 1);
		});
}
