import { tfmData } from 'dvi2html';
import { Buffer } from 'buffer';

var filesystem = {};
var files = [];
var showConsole = false;
var consoleBuffer = "";
var memory = null;
var inputBuffer = null;
var callback = null;

export function deleteEverything() {
	files = [];
	filesystem = {};
	memory = null;
	inputBuffer = null;
	callback = null;
	showConsole = false;
}

export function writeFileSync(filename, buffer)
{
	filesystem[filename] = buffer;
}

export function fileExists(filename) {
	return filename in filesystem;
}

export function readFileSync(filename)
{
	for (let f of files) {
		if (f.filename == filename) {
			return f.buffer.slice(0, f.position);
		}
	}

	throw Error(`Could not find file ${filename}`);
}

function openSync(filename, mode)
{
	let buffer = new Uint8Array();

	if (filesystem[filename]) {
		buffer = filesystem[filename];
	} else if (filename.match(/\.tfm$/)) {
		buffer = Uint8Array.from(tfmData(filename.replace(/\.tfm$/, '')));
	} else if (mode == "r") {
		// If this file has been opened before without an error, that means it was written to.
		// In that case assume the file can now be opened, so create a fake file.
		// Otherwise it is a file that should be reported as not found.
		let descriptor = files.findIndex(element => element.filename == filename && !element.erstat);
		if (descriptor == -1) {
			files.push({
				filename: filename,
				erstat: 1
			});
			return files.length - 1;
		}
	}

	files.push({ filename: filename,
		position: 0,
		erstat: 0,
		buffer: buffer,
		descriptor: files.length
	});

	return files.length - 1;
}

function closeSync(fd) {
	// ignore this.
}

function writeSync(file, buffer, pointer, length)
{
	if (pointer === undefined) pointer = 0;
	if (length === undefined) length = buffer.length - pointer;

	while (length > file.buffer.length - file.position) {
		let b = new Uint8Array(1 + file.buffer.length * 2);
		b.set(file.buffer);
		file.buffer = b;
	}

	file.buffer.subarray(file.position).set(buffer.subarray(pointer, pointer+length));
	file.position += length;
}

function readSync(file, buffer, pointer, length, seek)
{
	if (pointer === undefined) pointer = 0;
	if (length === undefined) length = buffer.length - pointer;

	if (length > file.buffer.length - seek)
		length = file.buffer.length - seek;

	buffer.subarray(pointer).set(file.buffer.subarray(seek, seek+length));

	return length;
}

function writeToConsole(x) {
	if (!showConsole) return;
	consoleBuffer += x;
	if (consoleBuffer.indexOf("\n") >= 0) {
		let lines = consoleBuffer.split("\n");
		consoleBuffer = lines.pop();
		for (let line of lines) {
			if (line.length) postMessage(line);
		}
	}
}

export function setShowConsole() {
	showConsole = true;
}

export function flushConsole() {
	if (consoleBuffer.length) writeToConsole("\n");
}

// setup

export function setMemory(m) {
	memory = m;
}

export function setInput(input, cb) {
	inputBuffer = input;
	if (cb) callback = cb;
}

// provide time back to tex

export function getCurrentMinutes() {
	var d = (new Date());
	return 60 * (d.getHours()) + d.getMinutes();
}

export function getCurrentDay() {
	return (new Date()).getDate();
}

export function getCurrentMonth() {
	return (new Date()).getMonth() + 1;
}

export function getCurrentYear() {
	return (new Date()).getFullYear();
}

// print

export function printString(descriptor, x) {
	var file = (descriptor < 0) ? {stdout:true} : files[descriptor];
	var length = new Uint8Array(memory, x, 1)[0];
	var buffer = new Uint8Array(memory, x + 1, length);
	var string = String.fromCharCode.apply(null, buffer);

	if (file.stdout) {
		writeToConsole(string);
		return;
	}

	writeSync(file, Buffer.from(string));
}

export function printBoolean(descriptor, x) {
	var file = (descriptor < 0) ? {stdout:true} : files[descriptor];

	var result = x ? "TRUE" : "FALSE";

	if (file.stdout) {
		writeToConsole(result);
		return;
	}

	writeSync(file, Buffer.from(result));
}
export function printChar(descriptor, x) {
	var file = (descriptor < 0) ? {stdout:true} : files[descriptor];
	if (file.stdout) {
		writeToConsole(String.fromCharCode(x));
		return;
	}

	var b = Buffer.alloc(1);
	b[0] = x;
	writeSync(file, b);
}

export function printInteger(descriptor, x) {
	var file = (descriptor < 0) ? {stdout:true} : files[descriptor];
	if (file.stdout) {
		writeToConsole(x.toString());
		return;
	}

	writeSync(file, Buffer.from(x.toString()));
}

export function printFloat(descriptor, x) {
	var file = (descriptor < 0) ? {stdout:true} : files[descriptor];
	if (file.stdout) {
		writeToConsole(x.toString());
		return;
	}

	writeSync(file, Buffer.from(x.toString()));
}

export function printNewline(descriptor, x) {
	var file = (descriptor < 0) ? {stdout:true} : files[descriptor];

	if (file.stdout) {
		writeToConsole("\n");
		return;
	}

	writeSync(file, Buffer.from("\n"));
}

export function reset(length, pointer) {
	var buffer = new Uint8Array(memory, pointer, length);
	var filename = String.fromCharCode.apply(null, buffer);

	if (filename.startsWith('{')) {
		filename = filename.replace(/^{/g, '');
		filename = filename.replace(/}.*/g, '');
	}

	filename = filename.replace(/ +$/g, '');
	filename = filename.replace(/^\*/, '');
	filename = filename.replace(/^TeXfonts:/, '');
	filename = filename.replace(/"/g, '');

	if (filename == 'TeXformats:TEX.POOL')
		filename = "tex.pool";

	if (filename == "TTY:") {
		files.push({
			filename: "stdin",
			stdin: true,
			position: 0,
			erstat: 0
		});
		return files.length - 1;
	}

	return openSync(filename, 'r');
}

export function rewrite(length, pointer) {
	var buffer = new Uint8Array(memory, pointer, length);
	var filename = String.fromCharCode.apply(null, buffer);

	filename = filename.replace(/ +$/g, '');

	if (filename == "TTY:") {
		files.push({ filename: "stdout",
			stdout: true,
			erstat: 0,
		});
		return files.length - 1;
	}

	return openSync(filename, 'w');
}

export function close(descriptor) {
	var file = files[descriptor];

	if (file.descriptor)
		closeSync(file.descriptor);
}

export function eof(descriptor) {
	var file = files[descriptor];

	if (file.eof) return 1;
	else return 0;
}

export function erstat(descriptor) {
	var file = files[descriptor];
	return file.erstat;
}

export function eoln(descriptor) {
	var file = files[descriptor];

	if (file.eoln) return 1;
	else return 0;
}

export function get(descriptor, pointer, length) {
	var file = files[descriptor];

	var buffer = new Uint8Array(memory);

	if (file.stdin) {
		if (file.position >= inputBuffer.length) {
			buffer[pointer] = 13;
			file.eof = true;
			file.eoln = true;
			if (callback) callback();
		} else
			buffer[pointer] = inputBuffer[file.position].charCodeAt(0);
	} else {
		if (file.descriptor) {
			if (readSync(file, buffer, pointer, length, file.position) == 0) {
				buffer[pointer] = 0;
				file.eof = true;
				file.eoln = true;
				return;
			}
		} else {
			file.eof = true;
			file.eoln = true;
			return;
		}
	}

	file.eoln = false;
	if (buffer[pointer] == 10) file.eoln = true;
	if (buffer[pointer] == 13) file.eoln = true;

	file.position = file.position + length;
}

export function put(descriptor, pointer, length) {
	var file = files[descriptor];

	var buffer = new Uint8Array(memory);

	writeSync(file, buffer, pointer, length);
}
