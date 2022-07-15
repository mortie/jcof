import * as jcof from "../implementations/javascript/jcof.js";
import * as fs from "fs";

let corpora = [
	"tiny",
	"circuitsim",
	"pokemon",
	"pokedex",
	"madrid",
	"meteorites",
	"comets",
];

function deepDiff(a, b) {
	if (a == b) {
		return null;
	}

	if (typeof a != typeof b) {
		return [typeof a, typeof b];
	}

	if (a == null) {
		return ["null, non-null"];
	} else if (b == null) {
		return ["non-null", "null"];
	}

	if ((a instanceof Array) && !(b instanceof Array)) {
		return ["array", "non-array"];
	} else if (!(a instanceof Array) && (b instanceof Array)) {
		return ["non-array", "array"];
	}

	if (typeof a != "object") {
		return [a, b];
	}

	if (a instanceof Array && b instanceof Array) {
		if (a.length != b.length) {
			return [`|${a.length}|`, `|${b.length}|`];
		}

		for (let i = 0; i < a.length; ++i) {
			let diff = deepDiff(a[i], b[i]);
			if (diff) {
				let d = {};
				d[i] = diff;
				return d;
			}
		}

		return null;
	}

	let keysA = Object.keys(a).sort();
	let keysB = Object.keys(b).sort();
	let keysDiff = deepDiff(keysA, keysB);
	if (keysDiff) {
		return {"$keys": keysDiff};
	}

	for (let key of keysA) {
		let diff = deepDiff(a[key], b[key]);
		if (diff) {
			let obj = {};
			obj[key] = diff;
			return obj;
		}
	}

	return null;
}

function strtime(t) {
	if (t > 1) {
		return t.toFixed(2) + "s";
	} else if (t > 0.0001) {
		return (t * 1000).toFixed(2) + "ms";
	} else {
		return (t * 1000000).toFixed(2) + "µs";
	}
}

function compare(corpus) {
	let text = fs.readFileSync(`corpus/${corpus}.json`, "utf-8");
	let obj = JSON.parse(text);

	console.log(corpus + ".json:");
	let jsonEnc = JSON.stringify(obj);
	console.log("  JSON:", jsonEnc.length, "bytes");
	fs.writeFileSync(`output/${corpus}.json`, jsonEnc);

	let jcofEnc = jcof.stringify(obj);
	fs.writeFileSync(`output/${corpus}.jcof`, jcofEnc);
	let parsed = jcof.parse(jcofEnc);
	let efficiency = (jcofEnc.length / jsonEnc.length).toFixed(3);
	console.log("  JCOF:", jcofEnc.length, "bytes", "(" + efficiency + "x)");

	let diff = deepDiff(parsed, obj);
	if (diff) {
		console.error(`Oh no, ${name} produced a wrong object!`);
		console.log(JSON.stringify(diff));
	}
}

fs.mkdir("output", () => {
	corpora.forEach(compare);
});
