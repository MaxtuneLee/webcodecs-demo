import "./style.css";
import { WebDemuxer } from "web-demuxer";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { drawFrame } from "./shader";
import { useReactive } from "./reactive";

const demuxer = new WebDemuxer({
	wasmLoaderPath: `${window.location.href}/wasm-files/ffmpeg-mini.js`,
});

let videoFrames: VideoFrame[] = [];
let videoLoaded = useReactive({ obj: false });
let isPlaying = false;

export function render() {
	document.getElementById("container")!.innerHTML = /* html */ `
        <button id='play'>播放视频</button>
		<button id='export'>导出视频</button>
    `;
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
					}
				}
				requestAnimationFrame(animate);
			}

			const play = async () => {
				const frame = videoFrames[index];
				drawFrame(gl, frame);
				index++;
			};

			requestAnimationFrame(animate);
		});
	document
		.querySelector<HTMLButtonElement>("#export")!
		.addEventListener("click", async () => {
			const encoderConfig = {
				codec: "avc1.4D0032",
				width: 1920,
				height: 1080,
				bitrate: 80000000,
				framerate: 24,
			};
			const muxer = new Muxer({
				target: new ArrayBufferTarget(),
				video: {
					width: encoderConfig.width,
					height: encoderConfig.height,
					codec: "avc",
				},
				fastStart: "in-memory",
			});
			const encoder = new VideoEncoder({
				output: async (chunk, meta) => {
					muxer.addVideoChunk(chunk, meta);
				},
				error: (error) => {
					console.error(error);
				},
			});
			encoder.configure(encoderConfig);
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
					drawFrame(renderCtx, frame);
					const duration = interval * 1000;
					encoder.encode(
						new VideoFrame(renderCanvas, {
							duration,
							timestamp: timeoffset,
						})
					);
					timeoffset += duration;
					index++;
				} else {
					clearInterval(renderInterval);
					await encoder.flush();
					muxer.finalize();
					let { buffer } = muxer.target;
					// Download buffer file as mp4
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

document
	.querySelector<HTMLButtonElement>("#add")!
	.addEventListener("click", async () => {
		const fileInput = document.querySelector<HTMLInputElement>("#file")!;
		fileInput.click();
		fileInput.addEventListener("change", async () => {
			videoFrames = [];
			const file = fileInput.files![0];
			await demuxer.load(file);
			const decoderConfig = await demuxer.getVideoDecoderConfig();

			const decoder = new VideoDecoder({
				output: (chunk) => {
					videoFrames.push(chunk.clone());
					chunk.close();
				},
				error: (error) => {
					console.error(error);
				},
			});
			decoder.configure(decoderConfig);
			const reader = demuxer.readAVPacket().getReader();
			reader
				.read()
				.then(async function processPacket({
					done,
					value,
				}): Promise<void> {
					if (done) {
						console.log("视频解包完成");
						await decoder.flush();
						videoLoaded.obj = true;
						return;
					}
					const videoChunk = demuxer.genEncodedVideoChunk(value);
					decoder.decode(videoChunk);
					return reader.read().then(processPacket);
				});
		});
	});
