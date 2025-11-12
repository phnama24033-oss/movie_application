// ===================== movie-list.js =====================
const express = require("express");
const { MongoClient } = require("mongodb");
const bodyParser = require("body-parser");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const path = require("path");

// ===================== MongoDB =====================
// Lấy URI từ biến môi trường Render
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("ERROR: MONGODB_URI chưa được set!");
  process.exit(1);
}

const client = new MongoClient(uri); // Không cần options với driver mới

// ===================== App =====================
const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: false }));

// ===================== Session =====================
app.use(
  session({
    secret: "abc",
    resave: false,
    saveUninitialized: true,
  })
);

// ===================== Passport =====================
app.use(passport.initialize());
app.use(passport.session());

// Middleware kiểm tra đăng nhập
function isAuthenticated(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect("/login");
}

// Admin LocalStrategy
passport.use(
  "admin-local",
  new LocalStrategy(function (username, password, done) {
    if (username === "Admin" && password === "12345") {
      return done(null, { username: "Aptech" });
    }
    return done(null, false, { message: "Incorrect admin username or password" });
  })
);

// User LocalStrategy
const users = [
  { id: 1, username: "abc", password: "123" },
  { id: 2, username: "user1", password: "user" },
];
passport.use(
  "user-local",
  new LocalStrategy(function (username, password, done) {
    const user = users.find((u) => u.username === username);
    if (!user) return done(null, false, { message: "Incorrect username" });
    if (user.password !== password) return done(null, false, { message: "Incorrect password" });
    return done(null, user);
  })
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = users.find((u) => u.id === id);
  done(null, user);
});

// ===================== Main =====================
async function main() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB Atlas");

    const database = client.db(); // Lấy database trong URI
    const collection = database.collection("MovieCollection");

    // ===================== ROUTES =====================

    // Trang chính
    app.get("/", (req, res) => {
      res.sendFile(__dirname + "/template/wonderland.html");
    });

    // Admin login
    app.get("/views/admin-login.ejs", (req, res) => res.render("admin-login"));
    app.post(
      "/admin-login",
      passport.authenticate("admin-local", {
        successRedirect: "/admin-dashboard",
        failureRedirect: "/admin-error",
      })
    );
    app.get("/admin-error", (req, res) => {
      res.send('<script>alert("Incorrect Admin username or password"); window.location.href = "/";</script>');
    });
    app.get("/admin-dashboard", (req, res) => res.sendFile(__dirname + "/template/movie-list.html"));

    // User login
    app.get("/views/login.ejs", (req, res) => res.render("login"));
    app.post(
      "/user-local",
      passport.authenticate("user-local", {
        successRedirect: "/user-dashboard",
        failureRedirect: "/user-error",
      })
    );
    app.get("/user-error", (req, res) => {
      res.send('<script>alert("Incorrect username or password"); window.location.href = "/";</script>');
    });
    app.get("/user-dashboard", (req, res) => res.sendFile(__dirname + "/template/book-seats-form.html"));

    // ===================== Movie API =====================
    // Lấy tất cả phim
    app.get("/get-all-movies", async (req, res) => {
      try {
        const movies = await collection.find().toArray();
        res.status(200).json(movies);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch movies" });
      }
    });

    // Lấy chi tiết phim
    app.get("/get-movie-details", async (req, res) => {
      const movieName = req.query.name;
      try {
        const movie = await collection.findOne({ "Movie name": movieName });
        if (!movie) return res.status(404).json({ error: "Movie not found" });
        res.status(200).json({ Description: movie.Description, Actors: movie.Actors });
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch movie details" });
      }
    });

    // Thêm phim
    app.post("/add-movie", async (req, res) => {
      try {
        await collection.insertOne(req.body);
        res.send('<script>alert("Movie added successfully"); window.location.href = "/admin-dashboard";</script>');
      } catch (err) {
        res.status(500).send("<h2>Failed to add movie</h2>");
      }
    });

    // Đặt ghế
    app.post("/book-seats", async (req, res) => {
      try {
        const isAdmin = req.isAuthenticated() && req.user.username === "Aptech";
        const movieNameToBook = req.body["Movie name"];
        const seatsToBook = parseInt(req.body["seats-to-book"]);

        const movie = await collection.findOne({ "Movie name": movieNameToBook });
        if (!movie) return res.send("Movie not found");

        if (seatsToBook <= movie["Available Seats"]) {
          const updatedSeats = movie["Available Seats"] - seatsToBook;
          await collection.updateOne({ "Movie name": movieNameToBook }, { $set: { "Available Seats": updatedSeats } });
          const redirectRoute = isAdmin ? "/admin-dashboard" : "/user-dashboard";
          res.send(`<script>alert("Booking successful for ${seatsToBook} seats"); window.location.href="${redirectRoute}";</script>`);
        } else {
          res.send(`Not enough seats available for ${movieNameToBook}`);
        }
      } catch (err) {
        res.status(500).send("Failed to book seats");
      }
    });

    // Xóa phim
    app.post("/delete-movie", async (req, res) => {
      const movieNameToDelete = req.body["Movie name"];
      const result = await collection.deleteOne({ "Movie name": movieNameToDelete });
      if (result.deletedCount === 1) {
        res.send('<script>alert("Movie deleted successfully"); window.location.href = "/admin-dashboard";</script>');
      } else {
        res.send('<script>alert("Failed to delete movie"); window.location.href = "/";</script>');
      }
    });

    // Cập nhật ghế
    app.post("/update-seats", async (req, res) => {
      const movieNameToUpdate = req.body["Movie name"];
      const newSeats = parseInt(req.body["Available Seats"]);
      await collection.updateOne({ "Movie name": movieNameToUpdate }, { $set: { "Available Seats": newSeats } });
      res.send('<script>alert("Seats updated successfully"); window.location.href = "/admin-dashboard";</script>');
    });

    // Logout
    app.get("/logout", (req, res) => {
      res.sendFile(__dirname + "/template/wonderland.html");
    });

  } catch (err) {
    console.error("❌ Error connecting to MongoDB:", err);
  }
}

main().catch(console.error);

// ===================== Start server =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
