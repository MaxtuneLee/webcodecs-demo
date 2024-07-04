export function drawFrame(gl: WebGL2RenderingContext, frame: VideoFrame) {
	const vsSource = `
        attribute vec4 aVertexPosition;
        attribute vec2 aTextureCoord;
        varying highp vec2 vTextureCoord;
        void main(void) {
            gl_Position = aVertexPosition;
            vTextureCoord = aTextureCoord;
        }
    `;

	const fsSource = `
        precision highp float;
        varying highp vec2 vTextureCoord;
        uniform sampler2D uSampler;
        void main(void) {
            vec4 color = texture2D(uSampler, vTextureCoord);
            if (vTextureCoord.x > 0.5) {
                float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                gl_FragColor = vec4(vec3(gray), color.a);
            } else {
                gl_FragColor = color;
            }
        }
    `;

	const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
	const programInfo = {
		program: shaderProgram,
		attribLocations: {
			vertexPosition: gl.getAttribLocation(
				shaderProgram,
				"aVertexPosition"
			),
			textureCoord: gl.getAttribLocation(shaderProgram, "aTextureCoord"),
		},
		uniformLocations: {
			uSampler: gl.getUniformLocation(shaderProgram, "uSampler"),
		},
	};
	const buffers = initBuffers(gl);
	const texture = createTexture(gl, frame);
	gl.clear(gl.COLOR_BUFFER_BIT);
	drawScene(gl, programInfo, buffers, texture);
}

function initShaderProgram(
	gl: WebGL2RenderingContext,
	vsSource: string,
	fsSource: string
): WebGLProgram {
	const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
	const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

	const shaderProgram = gl.createProgram()!;
	gl.attachShader(shaderProgram, vertexShader);
	gl.attachShader(shaderProgram, fragmentShader);
	gl.linkProgram(shaderProgram);

	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		console.error(
			"Unable to initialize the shader program:",
			gl.getProgramInfoLog(shaderProgram)
		);
		return null!;
	}

	return shaderProgram;
}

function loadShader(
	gl: WebGL2RenderingContext,
	type: number,
	source: string
): WebGLShader {
	const shader = gl.createShader(type)!;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error(
			"An error occurred compiling the shaders:",
			gl.getShaderInfoLog(shader)
		);
		gl.deleteShader(shader);
		return null!;
	}

	return shader;
}

function initBuffers(gl: WebGL2RenderingContext) {
	const positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

	const positions = new Float32Array([
		1.0, 1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0,
	]);

	gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

	const textureCoordBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);

	// 调整纹理坐标，使视频不再反转
	const textureCoordinates = new Float32Array([
		1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0,
	]);

	gl.bufferData(gl.ARRAY_BUFFER, textureCoordinates, gl.STATIC_DRAW);

	return {
		position: positionBuffer,
		textureCoord: textureCoordBuffer,
	};
}

function createTexture(
	gl: WebGL2RenderingContext,
	frame: VideoFrame
): WebGLTexture {
	const texture = gl.createTexture()!;
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGBA,
		frame.displayWidth,
		frame.displayHeight,
		0,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		frame
	);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	return texture;
}

function drawScene(
	gl: WebGL2RenderingContext,
	programInfo: any,
	buffers: any,
	texture: WebGLTexture
) {
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	const numComponents = 2;
	const type = gl.FLOAT;
	const normalize = false;
	const stride = 0;
	const offset = 0;

	gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
	gl.vertexAttribPointer(
		programInfo.attribLocations.vertexPosition,
		numComponents,
		type,
		normalize,
		stride,
		offset
	);
	gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

	gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
	gl.vertexAttribPointer(
		programInfo.attribLocations.textureCoord,
		numComponents,
		type,
		normalize,
		stride,
		offset
	);
	gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);

	gl.useProgram(programInfo.program);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.uniform1i(programInfo.uniformLocations.uSampler, 0);

	gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}
