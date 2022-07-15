/*
ISC License

Copyright (c) 2022 Martin Dørum

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
*/

let b62alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
let b62alphanum = {};
for (let i = 0; i < b62alphabet.length; ++i) {
	b62alphanum[b62alphabet[i]] = i;
}

function isSep(ch) {
	return ch == '[' || ch == ']' || ch == '{' || ch == '}' ||
		ch == '(' || ch == ')' || ch == ',' || ch == ':' || ch == '"';
}

class StringWriter {
	constructor() {
		this.str = "";
		this.nextMaybeSep = null;
		this.prevCh = null;
	}

	write(s) {
		if (this.maybeNextSep) {
			if (!isSep(this.prevCh) && !isSep(s[0])) {
				this.str += this.maybeNextSep;
			}
			this.maybeNextSep = null;
		}

		this.str += s;
		this.prevCh = s[s.length - 1];
	}

	maybeSep(sep) {
		if (this.nextMaybeSep) {
			this.write(this.maybeNextSep);
		}

		this.maybeNextSep = sep;
	}
}

function analyzeValue(value, strings, objectShapes) {
	if (value instanceof Array) {
		for (let v of value) {
			analyzeValue(v, strings, objectShapes);
		}
	} else if (typeof value == "object" && value != null) {
		let keys = Object.keys(value).sort();
		if (keys.length > 1) {
			let shapeHash = JSON.stringify(keys);
			let shape = objectShapes.get(shapeHash)
			if (shape == null) {
				objectShapes.set(shapeHash, {count: 1, keys});
			} else {
				shape.count += 1;
			}
		} else if (keys.length == 1) {
			let string = strings.get(keys[0]);
			if (string == null) {
				strings.set(keys[0], {count: 1});
			} else {
				string.count += 1;
			}
		}

		for (let key of keys) {
			analyzeValue(value[key], strings, objectShapes);
		}
	} else if (typeof value == "string" && value.length > 1) {
		let string = strings.get(value);
		if (string == null) {
			strings.set(value, {count: 1});
		} else {
			string.count += 1;
		}
	}
}

function analyze(value) {
	let strings = new Map();
	let objectShapes = new Map();
	analyzeValue(value, strings, objectShapes);
	for (let [hash, shape] of objectShapes) {
		if (shape.count == 1) {
			objectShapes.delete(hash);
		}
		for (let key of shape.keys) {
			let string = strings.get(key);
			if (string == null) {
				strings.set(key, {count: 1});
			} else {
				string.count += 1;
			}
		}
	}

	for (let [string, s] of strings) {
		if (s.count == 1) {
			strings.delete(string);
		}
	}

	let stringList = Array.from(strings.keys());
	let stringIds = new Map();
	stringList.sort((a, b) => strings.get(b).count - strings.get(a).count);
	for (let id = 0; id < stringList.length; ++id) {
		stringIds.set(stringList[id], id);
	}

	let objectShapeList = [];
	let objectShapeIds = new Map();
	for (let [hash, shape] of objectShapes) {
		objectShapeIds.set(hash, objectShapeList.length);
		objectShapeList.push(shape.keys);
	}

	return {stringList, stringIds, objectShapeList, objectShapeIds};
}

export function stringify(value) {
	let w = new StringWriter();
	let meta = analyze(value);

	stringifyStringTable(w, meta);
	w.write(';');
	stringifyObjectShapeTable(w, meta);
	w.write(';');
	stringifyValue(w, meta, value);
	return w.str;
}

function stringifyStringTable(w, meta) {
	if (meta.stringList.length == 0) {
		return;
	}

	stringifyString(w, meta.stringList[0]);
	for (let i = 1; i < meta.stringList.length; ++i) {
		w.maybeSep(',');
		stringifyString(w, meta.stringList[i]);
	}
}

function stringifyString(w, string) {
	if (/^[a-zA-Z0-9]+$/.test(string)) {
		w.write(string);
	} else {
		w.write(JSON.stringify(string));
	}
}

function stringifyObjectShapeTable(w, meta) {
	if (meta.objectShapeList.length == 0) {
		return;
	}

	stringifyObjectShape(w, meta, meta.objectShapeList[0]);
	for (let i = 1; i < meta.objectShapeList.length; ++i) {
		w.write(',');
		stringifyObjectShape(w, meta, meta.objectShapeList[i]);
	}
}

function stringifyObjectShape(w, meta, shape) {
	stringifyObjectKey(w, meta, shape[0]);
	for (let i = 1; i < shape.length; ++i) {
		w.maybeSep(':');
		stringifyObjectKey(w, meta, shape[i]);
	}
}

function stringifyObjectKey(w, meta, key) {
	let id = meta.stringIds.get(key);
	if (id == null) {
		w.write(JSON.stringify(key));
	} else {
		stringifyBase62(w, id);
	}
}

function stringifyBase62(w, num) {
	let str = "";
	do {
		str += b62alphabet[num % 62];
		num = Math.floor(num / 62);
	} while (num > 0);
	for (let i = str.length - 1; i >= 0; --i) {
		w.write(str[i]);
	}
}

function stringifyValue(w, meta, value) {
	if (value instanceof Array) {
		w.write('[');
		if (value.length == 0) {
			w.write(']');
			return;
		}

		stringifyValue(w, meta, value[0]);
		for (let i = 1; i < value.length; ++i) {
			w.maybeSep(',');
			stringifyValue(w, meta, value[i]);
		}

		w.write(']');
	} else if (typeof value == "object" && value != null) {
		let keys = Object.keys(value).sort();
		let hash = JSON.stringify(keys);
		let shapeId = meta.objectShapeIds.get(hash);
		if (shapeId == null) {
			stringifyKeyedObjectValue(w, meta, value, keys);
		} else {
			stringifyShapedObjectValue(w, meta, value, keys, shapeId);
		}
	} else if (typeof value == "number") {
		if (value == Math.floor(value) && (value < 0 || value > 10)) {
			if (value < 0) {
				w.write('I');
				stringifyBase62(w, -value);
			} else {
				w.write('i');
				stringifyBase62(w, value);
			}
		} else if (value == Infinity) {
			w.write('n'); // JSON.stringify outputs null for Infinity
		} else if (value == -Infinity) {
			w.write('n'); // JSON.stringify outputs null for -Infinity
		} else if (isNaN(value)) {
			w.write('n'); // JSON.stringify outputs null for NaN
		} else {
			// JavaScript's float to string function seems to always generate a
			// JCOF-compatible string
			w.write(value.toString());
		}
	} else if (typeof value == "string") {
		let stringId = meta.stringIds.get(value);
		if (stringId == null) {
			w.write(JSON.stringify(value));
		} else {
			w.write('s');
			stringifyBase62(w, stringId);
		}
	} else if (typeof value == "boolean") {
		w.write(value ? 'b' : 'B');
	} else if (value == null) {
		w.write('n');
	} else {
		throw new Error("Can't serialize value: " + value);
	}
}

function stringifyShapedObjectValue(w, meta, value, keys, shapeId) {
	w.write('(');
	stringifyBase62(w, shapeId);
	if (keys.length == 0) {
		w.write(')');
		return;
	}

	for (let key of keys) {
		w.maybeSep(',');
		stringifyValue(w, meta, value[key]);
	}

	w.write(')');
}

function stringifyKeyedObjectValue(w, meta, value, keys) {
	w.write('{');
	if (keys.length == 0) {
		w.write('}');
		return;
	}

	stringifyKeyValuePair(w, meta, keys[0], value[keys[0]]);
	for (let i = 1; i < keys.length; ++i) {
		w.maybeSep(',');
		stringifyKeyValuePair(w, meta, keys[i], value[keys[i]]);
	};

	w.write('}');
}

function stringifyKeyValuePair(w, meta, key, val) {
	stringifyObjectKey(w, meta, key);
	w.maybeSep(':');
	stringifyValue(w, meta, val);
}

export class ParseError extends Error {
	constructor(msg, index) {
		super(msg);
		this.name = "ParseError";
		this.index = index;
	}
}

class StringReader {
	constructor(str) {
		this.str = str;
		this.index = 0;
	}

	peek() {
		if (this.index >= this.str.length) {
			return null;
		} else {
			return this.str[this.index];
		}
	}

	consume() {
		this.index += 1;
	}

	skip(ch) {
		let peeked = this.peek();
		if (peeked != ch) {
			this.error("Unexpected char: Expected '" + ch + "', got '" + peeked + "'");
		}

		this.consume();
	}

	maybeSkip(ch) {
		if (this.peek() == ch) {
			this.consume();
		}
	}

	error(msg) {
		throw new ParseError(msg, this.index);
	}
}

export function parse(str) {
	let r = new StringReader(str);
	let stringTable = parseStringTable(r);
	r.skip(';');
	let objectShapeTable = parseObjectShapeTable(r, stringTable);
	r.skip(';');
	return parseValue(r, stringTable, objectShapeTable);
}

function parseStringTable(r) {
	if (r.peek() == ';') {
		return [];
	}

	let strings = [];
	while (true) {
		strings.push(parseString(r));
		let ch = r.peek();
		if (ch == ';') {
			return strings;
		} else if (ch == ',') {
			r.consume();
		}
	}
}

function parseString(r) {
	if (r.peek() == '"') {
		return parseJsonString(r);
	} else if (/[a-zA-Z0-9]/.test(r.peek())) {
		return parsePlainString(r);
	} else {
		r.error("Expected plain string or JSON string");
	}
}

function parsePlainString(r) {
	let str = r.peek();
	r.consume();
	let ch;
	while (true) {
		ch = r.peek();
		if (!/[a-zA-Z0-9]/.test(ch)) {
			return str;
		}

		str += ch;
		r.consume();
	}
}

function parseJsonString(r) {
	let start = r.index;
	r.skip('"');
	while (true) {
		let ch = r.peek();
		r.consume();
		if (ch == '"') {
			break;
		} else if (ch == '\\') {
			r.consume();
		} else if (ch == null) {
			r.error("Unexpected EOF");
		}
	}

	return JSON.parse(r.str.substring(start, r.index));
}

function parseObjectShapeTable(r, stringTable) {
	if (r.peek() == ';') {
		return [];
	}

	let shapes = [];
	while (true) {
		shapes.push(parseObjectShape(r, stringTable));
		let ch = r.peek();
		if (ch == ';') {
			return shapes;
		} else if (ch == ',') {
			r.consume();
		}
	}
}

function parseObjectShape(r, stringTable) {
	let shape = [];
	while (true) {
		shape.push(parseObjectKey(r, stringTable));
		let ch = r.peek();
		if (ch == ',' || ch == ';') {
			return shape;
		} else if (ch == ':') {
			r.consume();
		}
	}
}

function parseObjectKey(r, stringTable) {
	if (r.peek() == '"') {
		return parseJsonString(r);
	} else {
		let id = parseBase62(r);
		if (id >= stringTable.length) {
			r.error("String ID " + id + " out of range");
		}
		return stringTable[id];
	}
}

function parseBase62(r) {
	if (!/[0-9a-zA-Z]/.test(r.peek())) {
		r.error("Expected base62 value");
	}

	let num = 0;
	while (true) {
		num *= 62;
		num += b62alphanum[r.peek()];
		r.consume();
		if (!/[0-9a-zA-Z]/.test(r.peek())) {
			return num;
		}
	}
}

function parseValue(r, stringTable, objectShapeTable) {
	let ch = r.peek();
	if (ch == '[') {
		return parseArrayValue(r, stringTable, objectShapeTable);
	} else if (ch == '(') {
		return parseShapedObjectValue(r, stringTable, objectShapeTable);
	} else if (ch == '{') {
		return parseKeyedObjectValue(r, stringTable, objectShapeTable);
	} else if (/[iIf0-9\-]/.test(ch)) {
		return parseNumberValue(r);
	} else if (ch == 's' || ch == '"') {
		return parseStringValue(r, stringTable);
	} else if (ch == 'b') {
		r.consume();
		return true;
	} else if (ch == 'B') {
		r.consume();
		return false;
	} else if (ch == 'n') {
		r.consume();
		return null;
	} else {
		r.error("Expected value, got '" + ch + "'");
	}
}

function parseArrayValue(r, stringTable, objectShapeTable) {
	r.skip('[');
	if (r.peek() == ']') {
		r.consume();
		return [];
	}

	let arr = [];
	while (true) {
		arr.push(parseValue(r, stringTable, objectShapeTable));
		let ch = r.peek();
		if (ch == ']') {
			r.consume();
			return arr;
		} else if (ch == ',') {
			r.consume();
		}
	}
}

function parseShapedObjectValue(r, stringTable, objectShapeTable) {
	r.skip('(');
	let shapeId = parseBase62(r);
	if (shapeId >= objectShapeTable.length) {
		r.error("Shape ID " + shapeId + " out of range");
	}

	let shape = objectShapeTable[shapeId];
	let obj = {};
	for (let key of shape) {
		if (r.peek() == ',') {
			r.consume();
		}
		obj[key] = parseValue(r, stringTable, objectShapeTable);
	}

	r.skip(')');
	return obj;
}

function parseKeyedObjectValue(r, stringTable, objectShapeTable) {
	r.skip('{');
	if (r.peek() == '}') {
		r.consume();
		return {};
	}

	let obj = {};
	while (true) {
		let key = parseObjectKey(r, stringTable);
		if (r.peek() == ':') {
			r.consume();
		}

		obj[key] = parseValue(r, stringTable, objectShapeTable);
		let ch = r.peek();
		if (ch == ',') {
			r.consume();
		} else if (ch == '}') {
			r.consume();
			return obj;
		}
	}
}

function parseNumberValue(r) {
	let ch = r.peek();
	if (ch == 'i') {
		r.consume();
		return parseBase62(r);
	} else if (ch == 'I') {
		r.consume();
		return -parseBase62(r);
	} else {
		return parseFloatValue(r);
	}
}

function parseFloatValue(r) {
	// Here, we read the float, but then use JavaScript's float parser,
	// because making a float parser and serializer pair
	// which can round-trip any number is apparently pretty hard

	let str = "";
	let ch;

	if ((ch = r.peek()) == '-') {
		str += ch;
		r.consume();
	}

	while (/[0-9]/.test(ch = r.peek())) {
		str += ch;
		r.consume();
	}

	if (str == "" || str == "-") {
		r.error("Zero-length number in float literal");
	}

	if ((ch = r.peek()) == '.') {
		str += ch;
		r.consume();

		while (/[0-9]/.test(ch = r.peek())) {
			str += ch;
			r.consume();
		}

		if (str[str.length - 1] == '.') {
			r.error("Zero-length fractional part in float literal");
		}
	}

	ch = r.peek();
	if (ch == 'e' || ch == 'E') {
		str += ch;
		r.consume();

		ch = r.peek();
		if (ch == '+' || ch == '-') {
			str += ch;
			r.consume();
		}

		while (/[0-9]/.test(ch = r.peek())) {
			str += ch;
			r.consume();
		}

		if (!/[0-9]/.test(str[str.length - 1])) {
			r.error("Zero-length exponential part in float literal");
		}
	}

	return parseFloat(str);
}

function parseStringValue(r, stringTable) {
	if (r.peek() == '"') {
		return parseJsonString(r);
	} else {
		r.skip('s');
		let id = parseBase62(r);
		if (id >= stringTable.length) {
			r.error("String ID " + id + " out of range");
		}

		return stringTable[id];
	}
}
