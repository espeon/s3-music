let error = [];
const config = process.env;
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const hbs = require("hbs");
const Minio = require("minio");
const needle = require("needle");
const mm = require("music-metadata");

const app = express();

app.use(express.static("public"));
app.use(cors());

hbs.registerPartials(__dirname + "/public/partials/");

let metadata = JSON.parse(fs.readFileSync("./metadata.json").toString());

const client = new Minio.Client({
  endPoint: config.endpoint,
  port: 443,
  useSSL: true,
  accessKey: config.accessKey,
  secretKey: config.secretKey
});

app.set("view engine", "hbs");
app.set("views", __dirname + "/views");

app.get("/watch", async (req, res) => {
  let tw = [];
  tw.video = await getSignedURL(
    req.query.a,
    req.query.bucket ? req.query.bucket : "test"
  );
  tw.index = 1;
  tw.back = 0;
  tw.back.num = tw.index;
  tw.fwd = 0;
  tw.forw = tw.index + 2;
  tw.ff = 0;
  res.render("video", tw);
});

app.get(["/listen", "/embed"], async (req, res) => {
  console.log(req.url);
  let a = decodeURIComponent(
    req.query.a.replace(/(%2520)+/g, " ").replace(/(%20)+/g, " ")
  );
  let tw = [];
  console.log(req.query.a);
  console.log(a);
  let exists = await doesObjectExist(
    a,
    req.query.bucket ? req.query.bucket : "deemix"
  );
  console.log(exists);
  if (exists.err) {
    error.error = exists.err;
    res.render("404", error);
    return console.log(exists);
  }

  tw.video = await getSignedURL(
    a,
    req.query.bucket ? req.query.bucket : "deemix"
  );
  let m = await readFileMetadata(tw.video);
  console.log(m);
  tw.json = JSON.stringify(m);
  tw.title = m.common.title
    ? m.common.title.replace("Gamerip", "")
    : a.split("/")[a.split("/").length - 1];
  tw.artist = m.common.artist ? m.common.artist : "";
  if(!tw.albumartist) {m.common.albumartist = tw.artist}
  tw.artist = m.common.album ? tw.artist + " | " + m.common.album.replace("Gamerip", "") : "";
  tw.imageURL = "https://picsum.photos/1000";
  if (
    fs.existsSync(
      "public/" + m.common.albumartist + " - " + m.common.album + ".jpg"
    )
  ) {
    tw.imageURL = "/" + m.common.albumartist + " - " + m.common.album + ".jpg";
  }
  if (m.common.album && m.common.picture) {
    let imageBuffer = m.common.picture[0].data;
    metadata[tw.video.split("?")[0]].common.picture = "true";
    fs.writeFileSync("./metadata.json", JSON.stringify(metadata));
    saveImageToFile(m.common.albumartist + " - " + m.common.album, imageBuffer);
    tw.imageURL = "/" + m.common.albumartist + " - " + m.common.album + ".jpg";
  }
  tw.oembed =
    "https://"+req.headers.host+"/oembed?a=" + a + "&bucket=" + req.query.bucket;
  tw.playerURL = req.url.replace("/listen", "/embed");
  if (req.url.startsWith("/embed")) return res.render("embed", tw);
  else res.render("audio", tw);
});

app.get("/oembed", async (req, res) => {
  console.log(req.headers["user-agent"]);
  let a = req.query.a.replace(/(%25)+/g, "%");
  let tw = [];
  console.log(a);
  let exists = await doesObjectExist(
    a.replace(/(%25)+/g, "%"),
    req.query.bucket ? req.query.bucket : "deemix"
  );
  console.log(exists);
  if (exists.err) {
    error.error = exists.err;
    res.render("404", error);
    return console.log(exists);
  }

  tw.video = await getSignedURL(
    a.replace(/(%25)+/g, "%"),
    req.query.bucket ? req.query.bucket : "deemix"
  );
  let m = await readFileMetadata(tw.video);
  tw.title = m.common.title
    ? m.common.title.replace("Gamerip", "")
    : a.split("/")[a.split("/").length - 1];
  tw.artist = m.common.artist ? m.common.artist : "";
  tw.artist = m.common.album ? tw.artist + " | " + m.common.album : "";
  tw.imageURL = "https://picsum.photos/1000";
  if (
    fs.existsSync(
      "public/" + m.common.albumartist + " - " + m.common.album + ".jpg"
    )
  ) {
    tw.imageURL = "/" + m.common.albumartist + " - " + m.common.album + ".jpg";
  }
  if (m.common.album && m.common.picture) {
    let imageBuffer = m.common.picture[0].data;

    metadata[tw.video.split("?")[0]].common.picture = "true";
    fs.writeFileSync("./metadata.json", JSON.stringify(metadata));
    
    saveImageToFile(m.common.albumartist + " - " + m.common.album, imageBuffer);
    tw.imageURL = "/" + m.common.albumartist + " - " + m.common.album + ".jpg";
  }
  let embed = {
    version: 1.0,
    type: "rich",
    provider_name: "s3-test",
    provider_url: "https://twitter.com",
    height: 400,
    width: "100%",
    title: tw.title,
    description: tw.artist,
    thumbnail_url: tw.imageurl,
    html: `<iframe width="100%" height="400" scrolling="no" frameborder="no" src="https://`+req.headers.host+`/embed?a=${
      req.query.a
    }&bucket=${req.query.bucket ? req.query.bucket : "music"}"></iframe>`
  };
  console.log(embed.html);
  res.json(embed);
});

app.get("/", (req, res) => {
  res.render("harmon");
});

app.get("/api/s3/objects", async (req, res) => {
  let result = [];
  let cool = await listObjects(
    req.query.bucket,
    decodeURIComponent(req.query.prefix)
  );
  console.log(cool)
  cool.forEach(item => {
    result.push({
      file: item.name.split("/")[item.name.split("/").length - 1],
      uri:isMediaFile(item.name)?
        "https://"+req.headers.host+"/listen?a=" +
        item.name.replace(/(&)+/g, "%26") +
        "&bucket=" +
        req.query.bucket : item.name
    });
  });
  res.json(result);
});

app.get("/api/s3/redir", async (req, res) => {
  console.log(decodeURIComponent(req.query.name));
  let reso = await getSignedURL(req.query.name, req.query.bucket);
  res.redirect(reso);
});

async function getSignedURL(path, bucket) {
  return new Promise(resolve => {
    let presignedUrl = client.presignedGetObject(
      bucket,
      decodeURIComponent(path),
      2700,
      async (e, presignedUrl) => {
        if (e) return e;
        resolve(presignedUrl);
      }
    );
  });
}

// And we end with some more generic node stuff -- listening for requests :-)
let listener = app.listen(process.env.PORT, () => {
  console.log(
    "❗ Your app has restarted and is listening on port " +
      listener.address().port
  );
});

async function readFileMetadata(url) {
  if (metadata[url.split("?")[0]]) {
    return metadata[url.split("?")[0]];
  }
  const stream = needle.get(url, {
    timeout: 5000
  });
  return mm.parseStream(stream, null, { duration: true }).then(metadatae => {
    console.log(metadatae.common);
    metadata[url.split("?")[0]] = { common: metadatae.common };
    fs.writeFileSync("./metadata.json", JSON.stringify(metadata));
    return metadatae;
  });
}

function resolveAfter2Seconds() {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve("resolved");
    }, 2000);
  });
}

function saveImageToFile(filename, buffer) {
  if (fs.existsSync("public/" + filename + ".jpg")) {
    return console.log("file exists");
  } else {
    //nothing
  }
  console.log(buffer)
  return new Promise(resolve => {
    fs.writeFile("public/" + filename + ".jpg", buffer, "binary", function(
      err
    ) {
      if (err) {
        console.log(err);
      } else {
        console.log("The file was saved as", filename + ".jpg");
      }
    });
  });
}

function listObjects(bucket, prefix) {
  if (!bucket) return "hi";
  return new Promise(function(resolve, reject) {
    let objectsStream = client.listObjectsV2(bucket, prefix, true, "");
    let objects = [];
    objectsStream.on("data", function(data) {
      objects.push(data);
    });
    objectsStream.on("end", function() {
      resolve(objects);
    });
    objectsStream.on("error", reject);
  });
}

function doesObjectExist(object, bucket) {
  if (!bucket) return "hi";
  return new Promise(function(resolve, reject) {
    client.statObject(bucket, object, function(err, stat) {
      if (err) {
        resolve({ err: err });
      }
      resolve(stat);
    });
  });
}

let isMediaFile = (filename) => {
  if (['.mp3','.flac','.wav','.ogg'].some(char => filename.endsWith(char))) {
    return true
  }
}