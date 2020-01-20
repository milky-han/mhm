"use strict";

const { rebase, introduce, build, gc, merge } = require("megaminx");

const italize = require("../common/italize");
const { nameFont, setHintFlag, setHeight, fixFontLink } = require("./metadata.js");

const fs = require("fs-extra");
const path = require("path");

const globalConfig = fs.readJsonSync(path.resolve(__dirname, "../../config.json"));
const packageConfig = fs.readJsonSync(path.resolve(__dirname, "../../package.json"));
const ENCODINGS = globalConfig.os2encodings;

async function pass(ctx, config, argv) {
	const a = await ctx.run(introduce, "a", {
		from: argv.main,
		prefix: "a",
		ignoreHints: true
	});

	const glyphA = a.glyf[a.cmap["65"]];
	if (globalConfig.width != glyphA.advanceWidth)
		await ctx.run(rebase, "a", { scale: globalConfig.width / glyphA.advanceWidth });
	a.head.unitsPerEm = 1000;
	a.OS_2.xAvgCharWidth = globalConfig.width;
	const b = await ctx.run(introduce, "b", {
		from: argv.asian,
		prefix: "b",
		ignoreHints: true
	});
	const c = await ctx.run(introduce, "c", {
		from: argv.ws,
		prefix: "c",
		ignoreHints: true
	});

	// italize
	if (argv.italize) italize(b, 10);

	// merge and build
	await ctx.run(merge.below, "a", "a", "c", { mergeOTL: true });
	await ctx.run(merge.above, "a", "a", "b", { mergeOTL: true });

	const family = globalConfig.families[argv.family].naming;
	const subfamily = globalConfig.subfamilies[argv.subfamily].name;
	const style = globalConfig.styles[argv.style].name;
	await ctx.run(setHintFlag, "a");
	await ctx.run(fixFontLink, "a");
	await ctx.run(setHeight, "a", globalConfig.height);
	await ctx.run(
		nameFont,
		"a",
		globalConfig.nameTupleSelector[argv.subfamily],
		ENCODINGS[argv.subfamily],
		{
			en_US: {
				copyright: globalConfig.copyright,
				version: packageConfig.version,
				family: family.en_US + " " + subfamily,
				style: style
			},
			zh_CN: {
				family: family.zh_CN + " " + subfamily,
				style: style
			},
			zh_TW: {
				family: family.zh_TW + " " + subfamily,
				style: style
			},
			zh_HK: {
				family: family.zh_HK + " " + subfamily,
				style: style
			},
			ja_JP: {
				family: family.ja_JP + " " + subfamily,
				style: style
			},
			ko_KR: {
				family: family.ko_KR + " " + subfamily,
				style: style
			}
		}
	);

	await ctx.run(gc, "a");
	await ctx.run(build, "a", { to: config.o, optimize: true });
}

module.exports = async function makeFont(ctx, config, argv) {
	await pass(ctx, { o: argv.o }, argv);
};
