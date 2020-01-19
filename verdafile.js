"use strict";

const build = require("verda").create();
const { task, file, oracle, phony } = build.ruleTypes;
const { de, fu } = build.rules;
const { run, rm, cd, mv, cp } = build.actions;
const { FileList } = build.predefinedFuncs;

const fs = require("fs-extra");
const path = require("path");
const os = require("os");

build.setJournal(`build/.verda-build-journal`);
build.setSelfTracking();
module.exports = build;

// Directories
const PREFIX = `milky`;
const TTCPREFIX = `milky`;

const BUILD = `build`;
const IDH_CACHE = `cache/idh`;
const OUT = `out`;
const SOURCES = `sources`;

// Command line
const NODEJS = `node`;
const PYTHON = `python`;
const FONTTOOLS = `fonttools`;
const SEVEN_ZIP = `7z`;
const OTFCCDUMP = `otfccdump`;
const OTFCCBUILD = `otfccbuild`;
const OTF2TTF = `otf2ttf`;
const OTC2OTF = `otc2otf`;

const NPX_SUFFIX = os.platform() === "win32" ? ".cmd" : "";
const TTCIZE = "node_modules/.bin/otfcc-ttcize" + NPX_SUFFIX;
const Chlorophytum = [NODEJS, `./node_modules/@chlorophytum/cli/bin/_startup`];

///////////////////////////////////////////////////////////////////////////////////////////////////
// Entrypoint
const Start = phony("all", async t => {
	await t.need(Archive);
});

const Ttc = phony(`ttc`, async t => {
	await t.need(TtcFontFiles);
});

const Ttf = phony(`ttf`, async t => {
	await t.need(TtfFontFiles);
});

const Archive = phony(`archive`, async t => {
	await t.need(ArchiveFiles);
});

const Dependencies = oracle("oracles::dependencies", async () => {
	const pkg = await fs.readJSON(__dirname + "/package.json");
	const depJson = {};
	for (const pkgName in pkg.dependencies) {
		const depPkg = await fs.readJSON(__dirname + "/node_modules/" + pkgName + "/package.json");
		const depVer = depPkg.version;
		depJson[pkgName] = depVer;
	}
	return { requirements: pkg.dependencies, actual: depJson };
});

const Version = oracle("version", async t => {
	return (await fs.readJson(path.resolve(__dirname, "package.json"))).version;
});

function SevenZipCompress(dir, target, ...inputs) {
	return cd(dir).run(
		[SEVEN_ZIP, `a`],
		[`-t7z`, `-mmt=on`, `-ms=on`, `-m0=LZMA:a=0:d=512m:fb=273`],
		[`${target.name}.7z`, ...inputs]
	);
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// TTF Building

const BreakShsTtc = task.make(
	weight => `break-ttc::${weight}`,
	async ($, weight) => {
		const [config] = await $.need(Config, de(`${BUILD}/shs`));
		const shsSourceMap = config.shsSourceMap;
		await run(
			OTC2OTF,
			`${SOURCES}/shs/${shsSourceMap.defaultRegion}-${shsSourceMap.style[weight]}.otc`
		);
		for (const regionID in shsSourceMap.region) {
			const region = shsSourceMap.region[regionID];
			const partName = `${region}-${shsSourceMap.style[weight]}.otf`;
			if (await fs.pathExists(`${SOURCES}/shs/${partName}`)) {
				await rm(`${BUILD}/shs/${partName}`);
				await mv(`${SOURCES}/shs/${partName}`, `${BUILD}/shs/${partName}`);
			}
		}
	}
);

const ShsOtd = file.make(
	(region, weight) => `${BUILD}/shs/${region}-${weight}.otd`,
	async (t, output, region, weight) => {
		const [config] = await t.need(Config, BreakShsTtc(weight));
		const shsSourceMap = config.shsSourceMap;
		const [, $1] = await t.need(
			de(output.dir),
			fu`${BUILD}/shs/${shsSourceMap.region[region]}-${shsSourceMap.style[weight]}.otf`
		);
		const temp = `${output.dir}/${output.name}.tmp.ttf`;
		await run(OTF2TTF, [`-o`, temp], $1.full);
		await run(OTFCCDUMP, `-o`, output.full, temp);
	}
);

const NonKanji = file.make(
	(region, style) => `${BUILD}/non-kanji0/${region}-${style}.ttf`,
	async (t, { full, dir, name }, region, style) => {
		await t.need(Config, Scripts);
		const [$1] = await t.need(ShsOtd(region, style), de(dir));
		const tmpOTD = `${dir}/${name}.otd`;
		await RunFontBuildTask("make/non-kanji/build.js", {
			main: $1.full,
			o: tmpOTD
		});
		await OtfccBuildAsIs(tmpOTD, full);
	}
);

const WS0 = file.make(
	(family, region, style) => `${BUILD}/ws0/${family}-${region}-${style}.ttf`,
	async (t, { full, dir, name }, family, region, style) => {
		const [config] = await t.need(Config, Scripts);
		const [, $1] = await t.need(de(dir), NonKanji(region, style));
		const tmpOTD = `${dir}/${name}.otd`;
		await RunFontBuildTask("make/punct/ws.js", {
			main: $1.full,
			o: tmpOTD,
			mono: config.families[family].isMono || false,
			type: config.families[family].isType || false,
			pwid: config.families[family].isPWID || false,
			term: config.families[family].isTerm || false
		});
		await OtfccBuildAsIs(tmpOTD, full);
	}
);

const AS0 = file.make(
	(family, region, style) => `${BUILD}/as0/${family}-${region}-${style}.ttf`,
	async (t, { full, dir, name }, family, region, style) => {
		const [config] = await t.need(Config, Scripts);
		const [, $1] = await t.need(de(dir), NonKanji(region, style));
		const tmpOTD = `${dir}/${name}.otd`;
		await RunFontBuildTask("make/punct/as.js", {
			main: $1.full,
			o: tmpOTD,
			mono: config.families[family].isMono || false,
			type: config.families[family].isType || false,
			pwid: config.families[family].isPWID || false,
			term: config.families[family].isTerm || false
		});
		await OtfccBuildAsIs(tmpOTD, full);
	}
);

const Latin0 = file.make(
	(family, style) => `${BUILD}/latin0/${family}-${style}.ttf`,
	async (t, { full, dir }, family, style) => {
		const [config] = await t.need(Config);
		const latinFamily = config.families[family].latinGroup;
		const variation = config.styles[style].variation;
		const suffix = config.styles[style].suffix || `-${style}`;
		const [, $1] = await t.need(
			de(dir),
			fu`sources/${latinFamily}/${latinFamily}${suffix}.ttf`
		);
		if (variation)
			await run(
				FONTTOOLS, "varLib.instancer", "-q",
				["-o", full], $1.full,
				Object.entries(variation).map(o => `${o[0]}=${o[1]}`)
			);
		else
			await cp($1.full, full);
	}
)

const Pass1 = file.make(
	(family, region, style) => `${BUILD}/pass1/${family}-${region}-${style}.ttf`,
	async (t, { full, dir, name }, family, region, style) => {
		const [config] = await t.need(Config, Scripts);
		const [, $1, $2, $3] = await t.need(
			de(dir),
			Latin0(family, style),
			AS0(family, region, deItalizedNameOf(config, style)),
			WS0(family, region, deItalizedNameOf(config, style))
		);
		await RunFontBuildTask("make/pass1/build.js", {
			main: $1.full,
			asian: $2.full,
			ws: $3.full,
			o: full + ".tmp.otd",

			family: family,
			subfamily: region,
			style: style,
			italize: deItalizedNameOf(config, name) === name ? false : true
		});
		await OtfccBuildAsIs(full + ".tmp.otd", full + ".tmp.ttf");
		await rm(full + ".tmp.otd");
		await SanitizeTTF(full, full + ".tmp.ttf");
	}
);

const Kanji0 = file.make(
	(region, style) => `${BUILD}/kanji0/${region}-${style}.ttf`,
	async (t, { full, dir, name }, region, style) => {
		await t.need(Config, Scripts);
		const [$1] = await t.need(ShsOtd(region, style), de(dir));
		const tmpOTD = `${dir}/${name}.otd`;
		await RunFontBuildTask("make/kanji/build.js", {
			main: $1.full,
			o: tmpOTD
		});
		await OtfccBuildAsIs(tmpOTD, full);
	}
);
const Hangul0 = file.make(
	(region, style) => `${BUILD}/hangul0/${region}-${style}.ttf`,
	async (t, { full, dir, name }, region, style) => {
		await t.need(Config, Scripts);
		const [$1] = await t.need(ShsOtd(region, style), de(dir));
		const tmpOTD = `${dir}/${name}.otd`;
		await RunFontBuildTask("make/hangul/build.js", {
			main: $1.full,
			o: tmpOTD
		});
		await OtfccBuildAsIs(tmpOTD, full);
	}
);

const Prod = file.make(
	(family, region, style) => `${BUILD}/pass2/ttf/${PREFIX}-${family}-${region}-${style}.ttf`,
	async (t, { full, dir, name }, family, region, style) => {
		const [config] = await t.need(Config, Scripts, Version);
		const weight = deItalizedNameOf(config, style);
		const [, $1, $2, $3] = await t.need(
			de(dir),
			HfoPass1(region, weight, family, style),
			HfoKanji(region, weight, weight),
			HfoHangul(region, weight, weight)
		);
		const tmpOTD = `${dir}/${name}.otd`;
		await RunFontBuildTask("make/pass2/build.js", {
			main: $1.full,
			kanji: $2.full,
			hangul: $3.full,
			o: tmpOTD,
			italize: weight === style ? false : true
		});
		await OtfccBuildOptimize(tmpOTD, full);
	}
);

///////////////////////////////////////////////////////////////////////////////////////////////////
// HINTING

const HintDirPrefix = `${BUILD}/hf`;
const HintDirOutPrefix = `${BUILD}/hfo`;

const JHint = oracle("hinting-jobs", async () => os.cpus().length);
const KanjiInOTD = file.make(
	(weight, region, style) => `${HintDirPrefix}-${weight}/kanji-${region}-${style}.otd`,
	async (t, { dir, name }, weight, region, style) => {
		const [k0ttf] = await t.need(Kanji0(region, style), de(dir));
		await run(OTFCCDUMP, k0ttf.full, "-o", `${dir}/${name}.otd`);
	}
);
const HangulInOTD = file.make(
	(weight, region, style) => `${HintDirPrefix}-${weight}/hangul-${region}-${style}.otd`,
	async (t, { dir, name }, weight, region, style) => {
		const [k0ttf] = await t.need(Hangul0(region, style), de(dir));
		await run(OTFCCDUMP, k0ttf.full, "-o", `${dir}/${name}.otd`);
	}
);
const Pass1OTD = file.make(
	(weight, family, region, style) =>
		`${HintDirPrefix}-${weight}/pass1-${family}-${region}-${style}.otd`,
	async (t, { dir, name }, weight, family, region, style) => {
		const [k0ttf] = await t.need(Pass1(family, region, style), de(dir));
		await run(OTFCCDUMP, k0ttf.full, "-o", `${dir}/${name}.otd`);
	}
);

const GroupHint = task.make(
	(region, weight) => `group-hint::${weight}-${region}`,
	async (t, region, weight) => {
		const [config, jHint] = await t.need(Config, JHint);
		const shsWeight = config.shsSourceMap.style[weight];
		const [hintParam] = await t.need(fu`hinting-params/${shsWeight}.json`);

		const [kanjiDeps, pass1Deps] = OtdDeps(config, region, weight);
		const [kanjiOtds, pass1Otds] = await t.need(kanjiDeps, pass1Deps);

		await run(
			Chlorophytum,
			`hint`,
			[`-c`, hintParam.full],
			[`-h`, `${HintDirPrefix}-${weight}/cache.gz`],
			[`--jobs`, jHint],
			[...HintParams([...kanjiOtds, ...pass1Otds])]
		);
	}
);
const HintAll = task(`hint-all`, async t => {
	const [config] = await t.need(Config, de`${IDH_CACHE}`);
	for (const style of config.styleOrder) {
		if (config.styles[style].uprightStyleMap)
			continue;
		const shsWeight = config.shsSourceMap.style[style];
		for (const sf of Object.values(config.subfamilyOrder).flat()) {
			await run(
				PYTHON, "make/common/update-cache.py",
				"--override",
				`${IDH_CACHE}/${shsWeight}.json`,
				`${HintDirPrefix}-${style}/cache.gz`
			);
			await t.need(GroupHint(sf, style));
		}
		await run(
			PYTHON, "make/common/update-cache.py",
			`${IDH_CACHE}/${shsWeight}.json`,
			`${HintDirPrefix}-${style}/cache.gz`
		);
	}
});
const GroupInstr = task.make(
	(region, weight) => `group-instr::${weight}-${region}`,
	async (t, region, weight) => {
		const [config] = await t.need(Config);
		const shsWeight = config.shsSourceMap.style[weight];
		const [hintParam] = await t.need(fu`hinting-params/${shsWeight}.json`);

		const [kanjiDeps, pass1Deps] = OtdDeps(config, region, weight);
		const [kanjiOtds, pass1Otds] = await t.need(kanjiDeps, pass1Deps);
		await t.need(HintAll);

		await run(
			Chlorophytum,
			`instruct`,
			[`-c`, hintParam.full],
			[...InstrParams([...kanjiOtds, ...pass1Otds])]
		);
	}
);

const OutTtfMain = isCJK => async function (t, { full, dir, name }, region, weight) {
	const [config] = await t.need(Config);
	const shsWeight = config.shsSourceMap.style[weight];
	const [hintParam] = await t.need(fu`hinting-params/${shsWeight}.json`);
	await t.need(
		GroupInstr(region, weight),
		de`${HintDirOutPrefix}-${weight}`
	);
	await run(
		Chlorophytum,
		`integrate`,
		[`-c`, hintParam.full],
		[
			`${HintDirPrefix}-${weight}/${name}.instr.gz`,
			`${HintDirPrefix}-${weight}/${name}.otd`,
			`${HintDirOutPrefix}-${weight}/${name}.otd`
		]
	);
	if (isCJK) {
		await RunFontBuildTask("make/common/expand.js", {
			main: `${HintDirOutPrefix}-${weight}/${name}.otd`,
		});
	}
	await OtfccBuildAsIs(`${HintDirOutPrefix}-${weight}/${name}.otd`, full);
}
const HfoKanji = file.make(
	(region, weight, style) => `${HintDirOutPrefix}-${weight}/kanji-${region}-${style}.ttf`,
	OutTtfMain(true)
);
const HfoHangul = file.make(
	(region, weight, style) => `${HintDirOutPrefix}-${weight}/hangul-${region}-${style}.ttf`,
	OutTtfMain(true)
);
const HfoPass1 = file.make(
	(region, weight, family, style) =>
		`${HintDirOutPrefix}-${weight}/pass1-${family}-${region}-${style}.ttf`,
	OutTtfMain(false)
);

// Support functions
function OtdDeps(config, region, weight) {
	const kanjiDeps = [];
	kanjiDeps.push(KanjiInOTD(weight, region, weight));
	kanjiDeps.push(HangulInOTD(weight, region, weight));

	const pass1Deps = [];
	for (let f of config.familyOrder) {
		for (const style in config.styles) {
			if (deItalizedNameOf(config, style) !== weight) continue;
			pass1Deps.push(Pass1OTD(weight, f, region, style));
		}
	}

	return [kanjiDeps, pass1Deps];
}
function* HintParams(otds) {
	for (const otd of otds) {
		yield otd.full;
		yield `${otd.dir}/${otd.name}.hint.gz`;
	}
}
function* InstrParams(otds) {
	for (const otd of otds) {
		yield otd.full;
		yield `${otd.dir}/${otd.name}.hint.gz`;
		yield `${otd.dir}/${otd.name}.instr.gz`;
	}
}

//////////////////////////////////////////////////////////////////////////////////////////////////
// TTC building
const MixedTtcPhase1 = file.make(
	(region, style) => `${BUILD}/pass2/mixed-phase1/${region}-${style}.ttc`,
	async (t, { full }, region, style) => {
		const [config] = await t.need(Config, de`${BUILD}/pass2/mixed-phase1`);
		let reqs = [];
		for (let family of config.familyOrder)
			reqs.push(Prod(family, region, style));
		const [$$] = await t.need(reqs);
		await run(
			TTCIZE, ["--otfccbuild-command=make/common/otfccbuild-cmap4wrapper.py"],
			["--common-width", config.width * 2, "--common-height", 1000],
			["-o", full],
			[...$$.map(t => t.full)]
		);
	}
)

const TTCFile = file.make(
	(group, style) => `${BUILD}/pass2/ttc/${TTCPREFIX}-${group}-${style}.ttc`,
	async (t, { full }, group, style) => {
		const [config] = await t.need(Config, de`${OUT}/ttc`);
		const mode = config.ttcMode[group];
		if (mode == "mixed") {
			const [$$] = await t.need(config.subfamilyOrder[group].map(sf => MixedTtcPhase1(sf, style)));
			for (let $ of $$) {
				await run(OTC2OTF, $.full);
			}
			let phase1 = [];
			for (let family of config.familyOrder)
				for (let region of config.subfamilyOrder[group]) {
					const psName = `${config.families[family].naming.en_US} ${config.subfamilies[region].name} ${config.styles[style].name}`.replace(/-/g, "").replace(/ /g, "-");
					phase1.push(`${BUILD}/pass2/mixed-phase1/${psName}.ttf`);
				}
			await run(
				TTCIZE, ["--otfccbuild-command=make/common/otfccbuild-cmap4wrapper.py"],
				["-x"],
				["--common-width", config.width * 2, "--common-height", 1000],
				["-o", full],
				[...phase1]
			);
			phase1.map($ => rm($));
		} else {
			let reqs = [];
			for (let family of config.familyOrder)
				for (let region of config.subfamilyOrder[group])
					reqs.push(Prod(family, region, style));
			const [$$] = await t.need(reqs);
			await run(
				TTCIZE, ["--otfccbuild-command=make/common/otfccbuild-cmap4wrapper.py"],
				mode == "gap" ? ["-x"] : [],
				["--common-width", config.width * 2, "--common-height", 1000],
				["-o", full],
				[...$$.map(t => t.full)]
			);
		}
	}
);

//////////////////////////////////////////////////////////////////////////////////////////////////
// Post actions: add `hdmx` table
const TtfHdmx = file.make(
	(family, region, style) => `${OUT}/ttf/${PREFIX}-${family}-${region}-${style}.ttf`,
	async (t, { full, dir }, family, region, style) => {
		const [, $1] = await t.need(
			de(dir),
			Prod(family, region, style)
		);
		await run(PYTHON, "make/pass3/build.py", [`-i`, $1.full], [`-o`, full]);
	}
);

const TtcHdmx = file.make(
	(group, style) => `${OUT}/ttc/${TTCPREFIX}-${group}-${style}.ttc`,
	async (t, { full, dir }, group, style) => {
		const [, $1] = await t.need(
			de(dir),
			TTCFile(group, style)
		);
		await run(PYTHON, "make/pass3/build.py", [`-i`, $1.full], [`-o`, full]);
	}
);

//////////////////////////////////////////////////////////////////////////////////////////////////
// Archive
const TtcFontFiles = task("ttcFontFiles", async t => {
	const [config] = await t.need(Config, de`${OUT}/ttc`);
	let reqs = [];
	for (let [g, sfs] of Object.entries(config.subfamilyOrder))
		if (sfs.length > 1 || config.familyOrder.length > 1)
			for (let st of config.styleOrder)
				reqs.push(TtcHdmx(g, st));
	await t.need(...reqs);
});

const TtfFontFiles = task("ttfFontFiles", async t => {
	const [config] = await t.need(Config, de`${OUT}/ttf`);
	let reqs = [];
	for (let f of config.familyOrder)
		for (let sf of Object.values(config.subfamilyOrder).flat())
			for (let st of config.styleOrder) {
				reqs.push(TtfHdmx(f, sf, st));
			}
	await t.need(...reqs);
});

const GroupArchiveFile = file.make(
	(group, version) => `${OUT}/${TTCPREFIX}-${group}-${version}.7z`,
	async (t, target, group) => {
		const [config] = await t.need(Config);
		await t.need(TtfFontFiles, TtcFontFiles);
		await rm(target.full);
		let weightGroup = {};
		for (let st of config.styleOrder) {
			let upright = config.styles[st].uprightStyleMap;
			if (upright)
				weightGroup[upright] ? weightGroup[upright].push(st) : weightGroup[upright] = [ st ];
			else
				weightGroup[st] ? weightGroup[st].push(st) : weightGroup[st] = [ st ];
		}
		for (let w in weightGroup) {
			let files = [];
			for (let st of weightGroup[w]) {
				const families = config.familyOrder;
				const subfamilies = config.subfamilyOrder[group];
				if (subfamilies.length > 1 || families.length > 1)
					files.push(`ttc/${TTCPREFIX}-${group}-${st}.ttc`);
				for (let f of families)
					for (let sf of subfamilies)
						files.push(`ttf/${PREFIX}-${f}-${sf}-${st}.ttf`);
			}
			await SevenZipCompress(`${OUT}`, target, ...files);
		}
	}
);

const ArchiveFiles = task("archiveFiles", async t => {
	const [config, version] = await t.need(Config, Version);
	let reqs = [];
	for (let g in config.subfamilyOrder)
		reqs.push(GroupArchiveFile(g, version));
	await t.need(...reqs);
});

///////////////////////////////////////////////////////////////////////////////////////////////////
// Build Scripts & Config
const ScriptsStructure = oracle("scripts-dir-structure", target =>
	FileList({ under: `make`, pattern: `**/*.js` })(target)
);

const Scripts = task("scripts", async t => {
	await t.need(Dependencies);
	const [scriptList] = await t.need(ScriptsStructure);
	await t.need(scriptList.map(fu));
});

const Config = oracle("config", async () => {
	return await fs.readJSON(__dirname + "/config.json");
});

///////////////////////////////////////////////////////////////////////////////////////////////////
// CLI wrappers
async function OtfccBuildOptimize(from, to) {
	await run(OTFCCBUILD, from, [`-o`, to], [`-O3`, `-s`, `--keep-average-char-width`, `-q`]);
	await rm(from);
}
async function OtfccBuildAsIs(from, to) {
	await run(OTFCCBUILD, from, [`-o`, to], [`-k`, `-s`, `--keep-average-char-width`, `-q`]);
	await rm(from);
}

async function RunFontBuildTask(recipe, args) {
	return await run(NODEJS, "run", "--recipe", recipe, ...objToArgs(args));
}
function objToArgs(o) {
	let a = [];
	for (let k in o) {
		if (o[k] === false) continue;
		if (k.length === 1) {
			a.push("-" + k);
		} else {
			a.push("--" + k);
		}
		if (o[k] !== true) {
			a.push("" + o[k]);
		}
	}
	return a;
}

async function SanitizeTTF(target, ttf) {
	const tmpTTX = `${ttf}.ttx`;
	const tmpTTF2 = `${ttf}.2.ttf`;
	await run("ttx", "-q", "-o", tmpTTX, ttf);
	await run("ttx", "-q", "-o", tmpTTF2, tmpTTX);
	await run("ttfautohint",
		"--default-script=latn", "--fallback-script=latn",
		"--hinting-limit=48",
		"--hinting-range-min=7", "--hinting-range-max=48",
		"--no-info",
		"--increase-x-height=14",
		tmpTTF2, target
	);
	await rm(ttf);
	await rm(tmpTTX);
	await rm(tmpTTF2);
}

function deItalizedNameOf(config, set) {
	return (set + "")
		.split("-")
		.map(w => (config.styles[w] ? config.styles[w].uprightStyleMap || w : w))
		.join("-");
}
