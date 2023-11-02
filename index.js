process.env.LANG = 'hu_HU.UTF-8';
const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const JSONdb = require('simple-json-db');
const db = new JSONdb('./db.json');
const fs = require('fs');
const utf8 = require('utf8');
const cookieParser = require('cookie-parser');
const socketIO = require("socket.io");
var multer = require("multer");
var upload = multer({ dest: "uploads/" });
const Database = require("@replit/database");
const keys = Object.keys(db.storage);
const path = require('path'); // <--- Új import




const app = express();
const server = require("http").createServer(app);
const io = socketIO(server);



//limit is in hours instead of days, weeks or months (gives more control)
const limitResetPeriod = process.env.LIMITRESET;
//Upload limit is currently at 4 uploads a day.
const uploadLimit = process.env.UPLOADLIMIT;

app.use(
  fileUpload({
    createParentPath: true
  })
);

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());
app.use(morgan('dev'));
app.use(cookieParser());

 
app.post('/save', (req, res) => {
  const content = req.body.content;
  if (content) {
    db.set('content', content);
    res.redirect('/');
  } else {
    res.status(400).send('A tartalom mező hiányzik a kérésből');
  }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));



app.get('/load', (req, res) => {
	res.render('load.html');
});

app.get('/login', (req, res) => {
	res.render('login.html');
});
app.get('/lang', (req, res) => {
	res.render('lang.html');
});

app.get('/fasz', (req, res) => {
	res.render('lang-change.html');
});
app.get('/hu', (req, res) => {
	res.render('index.html');
});
app.get('/en', (req, res) => {
	res.render('en.html');
});

app.get('/de', (req, res) => {
	res.render('de.html');
});
app.get('/playlist', (req, res) => {
	res.render('playlist.html');
});
app.get('/uploads', (req, res) => {
	res.redirect('/');
});
app.get('/uploads-en', (req, res) => {
	res.redirect('/');
});



fs.watch("uploads", (eventType, filename) => {
  if (eventType === "rename" && filename) {
    io.emit("newSong", filename); // Új zenék eseményként való küldése a klienseknek
  }
});

app.get('/', (req, res) => {
	fs.readdir('./uploads', (err, files) => {
		if (err) {
			alert('Hiba történt az "uploads" mappa olvasása közben:', err);
			res.status(500).send('Hiba történt az "uploads" mappa olvasása közben');
		} else {
      const filesWithUploadDate = files.map(file => {
        const info = db.get(file);
        const size = info.size;
        // Konvertáljuk a dátumot emberi olvasható formátumba
        const feltoltesDatum = new Date(info.feltoltes_datum).toLocaleString();

        return {
          filename: info.name,
          type: info.type,
          size: size,
          feltoltes_datum: feltoltesDatum // Hozzáadjuk a dátumot az objektumhoz
        };
      });
			res.render('uploads.html', { files });
		}
	});
  
});

app.get('/all', (req, res) => {
	fs.readdir('./uploads', (err, files) => {
		if (err) {
			alert('Hiba történt az "uploads" mappa olvasása közben:', err);
			res.status(500).send('Hiba történt az "uploads" mappa olvasása közben');
		} else {
			res.render('all.html', { files });
		}
	});
});

// Az "uploads" útvonal kezelése
app.post("/uploads", upload.single("song"), function(req, res) {
  // Fájl feltöltése sikeres volt

  // Küldj egy "newSong" eseményt a klienseknek az új fájl nevével
  io.emit("newSong", req.file.originalname);

  // Változtasd meg a választ "uploads.html" helyett "index.html"-re
  res.redirect("/index.html");
});



app.post('/upload', (req, res) => {
  var file = req.files.file;
  var name = utf8.decode(file.name); // Fájlnév dekódolása
  var originame = file.name;
  var type = file.mimetype;
  var size = file.size;
  var dimensions = file.image - size;

  // Feltöltés dátuma
  const feltoltesDatum = new Date().toISOString();

  if (size > 104857600) {
    res.render('largefile.html');
  } else {
    number = 0;
    if (Object.keys(db.storage).includes(name)) {
      while (true) {
        number += 1;
        name = originame + '-' + String(number);
        if (!Object.keys(db.storage).includes(name)) break;
      }
    }

    // Dátum hozzáadása az adatokhoz
    const adatok = { 
      name: name,
      type: type,
      size: size,
      feltoltes_datum: feltoltesDatum // Hozzáadjuk a feltöltés dátumát
    };

    db.set(name, adatok);
    file.mv('./uploads/' + name);
    res.redirect('/file/' + name);
  }
});

app.post('/playlist', (req, res) => {
    const folderName = req.body.folderName;
    const musicFile = req.files.music;
    var name = utf8.decode(musicFile.name); // Fájlnév dekódolása

    if (!fs.existsSync(folderName)) {
        fs.mkdirSync(folderName);
    }

    const musicPath = `${folderName}/${name}`;
    musicFile.mv(musicPath, (err) => {
        if (err) {
            return res.status(500).send(err);
        }
        
        // Megjelenítéshez szükséges hivatkozások létrehozása
        const playlistLink = `<meta http-equiv="refresh" content="0; url=/playlist/${folderName}">`;
        
        res.send(`Feltöltés és mappa létrehozás sikeres. ${playlistLink}`);
    });
});


app.get('/playlist/:folderName', (req, res) => {
    const folderName = req.params.folderName;
    const folderPath = `${__dirname}/${folderName}`;

    if (!fs.existsSync(folderPath)) {
        res.status(404).render('404.html');
    }

    const files = fs.readdirSync(folderPath);

    const musicList = files.map(file => {
        return {
            filename: file,
            // További információk a zenékhez
        };
    });

    res.render('playlist', { folderName, musicList });
});


app.get('/playlist/:folderName/:musicFile', (req, res) => {
    const folderName = req.params.folderName;
    const musicFile = req.params.musicFile;
    const filePath = `${__dirname}/${folderName}/${musicFile}`;

    if (!fs.existsSync(filePath)) {
        res.status(404).render('404.html');
    }

    const music = { filename: musicFile }; // Itt létrehozzuk a music objektumot
    res.render('player.html', { folderName, music }); // Átadjuk a folderName és music objektumot a nézetnek
});

app.get('/playlist/:folderName/:musicFile/play', (req, res) => {
    const folderName = req.params.folderName;
    const musicFile = req.params.musicFile;
    const filePath = `${__dirname}/${folderName}/${musicFile}`;

    if (!fs.existsSync(filePath)) {
        res.status(404).render('404.html');
    }

    res.sendFile(filePath);
});

app.get('/playlist/:folderName/:musicFile/download', (req, res) => {
    const folderName = req.params.folderName;
    const musicFile = req.params.musicFile;
    const filePath = `${__dirname}/${folderName}/${musicFile}`;

    if (!fs.existsSync(filePath)) {
        res.status(404).render('404.html');
    }

    // Beállítjuk a letöltéshez szükséges fejléceket
    res.setHeader('Content-Disposition', `attachment; filename=${musicFile}`);
    res.setHeader('Content-Type', 'application/octet-stream');

    // Elküldjük a fájlt a letöltéshez
    res.sendFile(filePath);
});







app.get('/file/:filename', (req, res) => {
	filename = req.params.filename;
	if (Object.keys(db.storage).includes(filename)) {
		info = db.get(filename);
		size = info.size;
		if (size > 1000000) {
			size = String(Math.round(size / 10000) / 100) + ' MB';
		} else if (size > 1000) {
			size = String(Math.round(size / 10) / 100) + ' KB';
		} else {
			size = String(size) + ' Bájt';
		}
		res.render('file.html', {
			filename: info.name,
			type: info.type,
			size: size
		});
	} else {
		res.redirect('/404');
	}
});

app.get('/embed/:filename', (req, res) => {
	filename = req.params.filename;
	if (Object.keys(db.storage).includes(filename)) {
		info = db.get(filename);
		size = info.size;
		if (size > 1000000) {
			size = String(Math.round(size / 10000) / 100) + ' MB';
		} else if (size > 1000) {
			size = String(Math.round(size / 10) / 100) + ' KB';
		} else {
			size = String(size) + ' Bájt';
		}
		res.render('share.html', {
			filename: info.name,
			type: info.type,
			size: size
		});
	} else {
		res.redirect('/404');
	}
});

// szerkesztés GET lekèrès fixelve

app.get('/report/:filename', (req, res) => {
	filename = req.params.filename;
	if (Object.keys(db.storage).includes(filename)) {
		info = db.get(filename);
		size = info.size;
		if (size > 1000000) {
			size = String(Math.round(size / 10000) / 100) + ' MB';
		} else if (size > 1000) {
			size = String(Math.round(size / 10) / 100) + ' KB';
		} else {
			size = String(size) + ' Bájt';
		}
		res.render('report.html', {
			filename: info.name,
			type: info.type,
			size: size
		});
	} else {
		res.redirect('/404');
	}
});

app.get('/file/:filename/download', (req, res) => {
	filename = req.params.filename;
	if (Object.keys(db.storage).includes(filename)) {
		res.download(process.cwd() + '/uploads/' + filename);
	} else {
		res.redirect('/404');
	}
});

app.get('/uploads/:filename', (req, res) => {
	filename = req.params.filename;
	if (Object.keys(db.storage).includes(filename)) {
		res.sendFile(process.cwd() + '/uploads/' + filename);
	} else {
		res.redirect('/404');
	}
});

app.post("/createaccount", (req, res) => {
  var newusername = req.body.newusername;
  newpassword = req.body.newpassword;
  letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
  cap_letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
  numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  allchars = letters + cap_letters + numbers + ['_'];
  goodusername = true;
  for(let i of newusername){
    if(!allchars.includes(i)){
      goodusername = false;
    }
  }
  if(goodusername){
    db.list().then(keys => {
      if(keys.includes(newusername)){
        res.redirect("/");
      } else if(newusername == ""){
        res.send("Írj be egy felhasználónevet.");
      } else if(newpassword == ""){
        res.send("Írj be egy jelszavat.")
      } else{
        db.set(newusername, newpassword).then(() => console.log("Új fiók"));
        res.cookie("loggedIn", "true")
        res.cookie("username", newusername);
        res.redirect("/dashboard");
      }
    });
  } else{
    res.redirect("/")
  }
});
app.get("/signup", (req, res) => {
  loggedIn = req.cookies.loggedIn;
  if(loggedIn == "true"){
    res.redirect("/");
  } else{
    res.render("register.html");
  }
});
app.get("/logout", (req, res) => {
  res.cookie("loggedIn", "false");
  res.clearCookie("username");
  res.redirect("/");
  console.log("kilépés")
});

app.post("/loginsubmit", (req, res) => {
  var username = req.body.username;
  var password = req.body.password;
  db.list().then(keys => {
    if(keys.includes(username)){
      db.get(username).then(value => {
        if(password == value){
          res.cookie("loggedIn", "true");
          res.cookie("username", username);
          console.log("Belépés")
          res.redirect("/dashboard");
        } else{
          res.redirect("/");
        }
      });
    } else{
      res.redirect("/fioknincs");
    }
  });
});

app.get("/dashboard", (req, res) => {
  loggedIn = req.cookies.loggedIn;
  username = req.cookies.username;
  if(loggedIn == "true"){
    db.list().then(keys => {
      if(keys.includes(username)){
        res.render("dashboard.html",{username:username})
      } else{
        res.redirect("/logout");
      }
    });
    
  } else{
    res.render("login.html");
  }
});
// hibàs útvàlasztó

app.get('/*', (req, res) => {
	res.render('404.html');
});
app.get('404', (req, res) => {
	res.render('404.html');
});


// túl nagy fàjlok utàni figyelmeztetès

app.get("/largefile", (req, res) => {
  loggedIn = req.cookies.loggedIn;
  if(loggedIn == "false"){
    res.redirect("/");
  } else{
    res.render("largefile.html");
  }
});


app.listen(3000, () => {
  console.log("server started");
});