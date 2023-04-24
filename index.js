const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser')

const app = express();
app.use((req, res, next) => {
    // by default bodyParser leaks the whole error stack!
    bodyParser.json({ limit: 1000000 })(req, res, (err) => {
        if (err) {
            console.log(err);
            res.sendStatus(400);
            return;
        }
        next();
    });
});

const ROOT_PATH = "/qgis";
const DATA_PATH = "./data";
const HOST_PATH = "https://a.mjpdev.com/qgis"

function ensureDataFolder() {
    const dataFolder = path.join(__dirname, DATA_PATH)
    if (!fs.existsSync(dataFolder)) {
        fs.mkdirSync(dataFolder, { recursive: true });
    }    
}

ensureDataFolder();

async function readdir(path, options) {
    return new Promise((resolve, reject) => fs.readdir(path, options, (err, files) => {
        if (err) reject(err);
        else resolve(files);
    }));
}

async function readFile(path, options) {
    return new Promise((resolve, reject) => fs.readFile(path, options, (err, data) => {
        if (err) reject(err);
        else resolve(data);
    }));
}

async function getPlugins() {
    const pluginNames = await readdir(DATA_PATH, {});

    const plugins = await Promise.all(pluginNames.map(async name => {
        try {
            const pluginInfoPath = path.join(DATA_PATH, name, "plugin.json");
            const info = await readFile(pluginInfoPath, { encoding: "utf-8"});
            return { name, info: JSON.parse(info) };
        } catch (ex) {
            return null
        }
    }));

    return plugins.filter(Boolean);
}

app.get(`${ROOT_PATH}/plugins.xml`, async (req, res) => {
    const plugins = await getPlugins();
    const resp = [];
    resp.push("<plugins>");
    for(const plugin of plugins) {
        const { name, info } = plugin;
        resp.push(`  <pyqgis_plugin name="${info.name}" version="${info.version}">`);
        resp.push(`    <description>${info.description}</description>`);
        resp.push(`    <homepage>${info.homepage}</homepage>`);
        resp.push(`    <qgis_minimum_version>${info.qgis_minimum_version}</qgis_minimum_version>`);
        resp.push(`    <file_name>${name}.zip</file_name>`);
        resp.push(`    <author_name>${info.author_name}</author_name>`);
        resp.push(`    <download_url>${HOST_PATH}/plugins/${name}</download_url>`);       
        resp.push(`  </pyqgis_plugin>`);
    }
    resp.push("</plugins>")

    res.set("Content-Type", "application/xml");
    res.send(resp.join("\n"));
});

app.get(`${ROOT_PATH}/plugins.json`, async (req, res) => {
    try {
        const plugins = await getPlugins();
        res.set("Content-Type", "application/json");
        res.send(plugins);
    } catch {
        res.status(500).send("Failed");
    }
});

// Fetch a plugin
app.get(`${ROOT_PATH}/plugins/:plugin`, (req, res) => {
    // Note that express automatically computes file name as (plugin-name).zip
    res.sendFile("plugin.zip", {
        root: path.join(__dirname, DATA_PATH, req.params.plugin)
    }, err => {
        if (err) {
            res.status(404).end("Plugin not found.");
        }
    });
});

// Push up a new version of a plugin
app.put(`${ROOT_PATH}/plugins/:plugin`, (req, res) => {
    const payload = req.body;

    if (!payload.zip || !payload.info) {
        res.status(400).end("Missing data in payload");
        return;
    }

    try {
        const pluginFolder = path.join(__dirname, DATA_PATH, req.params.plugin)
        if (!fs.existsSync(pluginFolder)) {
            fs.mkdirSync(pluginFolder, { recursive: true });
        }
    
        fs.writeFileSync(path.join(pluginFolder, "plugin.zip"), payload.zip, { encoding: "base64"});
        fs.writeFileSync(path.join(pluginFolder, "plugin.json"), JSON.stringify(payload.info), { encoding: "utf-8"});

        res.set("Content-Type", "application/json");
        res.send({ result: "ok"});
    } catch (ex) {
        res.status(500).send("Error");
    }

});

app.listen(3008, function () {
    console.log('Plugin server running on 3008.');
});