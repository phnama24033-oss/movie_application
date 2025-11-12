// movie-list.js
const express = require("express");
const { MongoClient } = require("mongodb");
const bodyParser = require("body-parser");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const path = require("path");

// MongoDB Atlas URI từ biến môi trường
const uri = "mongodb+srv://phnam:phnam123@cluster0.xslahjs.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri);

const app = express();

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: false }));

// Session
app.use(
  session({
    secret: "abc",
    resave: false,
    saveUninitialized: true,
  })
);

// Passport
app.use(passport.initialize());
app.use(passport.session());

// ---- Middleware kiểm tra đăng nhập ----
function isAuthenticated(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  } else {
    res.redirect("/login");
  }
}

// ---- Local strategy cho Admin ----
passport.use(
  "admin-local",
  new LocalStrategy(function (username, password, done) {
    if (username === "Admin" && password === "12345") {
      return done(null, { username: "Aptech" });
    }
    return done(null, false, { message: "Incorrect admin username or password" });
  })
);

// ---- Local strategy cho User ----
const users = [
  { id: 1, username: "abc", password: "123" },
  { id: 2, username: "user1", password: "user" },
];

passport.use(
  "user-local",
  new LocalStrategy(function (username, password, done) {
    const user = users.find((u) => u.username === username);
    if (!user) return done(null, false, { message: "Incorrect username" });
    if (user.password !== password)
      return done(null, false, { message: "Incorrect password" });
    return done(null, user);
  })
);

passport.serializeUser(function (user, done) {
  done(null, user.id);
});
passport.deserializeUser(function (id, done) {
  const user = users.find((u) => u.id === id);
  done(null, user);
});

// =================== MAIN FUNCTION ===================
async function main() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB Atlas");

    const database = client.db(); // database lấy từ URI
    const collection = database.collection("MovieCollection");

    // ------------------- Seed dữ liệu mẫu -------------------
    const sampleMovies = [
      {
        "Movie name": "Inception",
        "Category": "Sci-Fi",
        "Description": "A thief who steals corporate secrets through dream-sharing technology.",
        "Actors": ["Leonardo DiCaprio", "Joseph Gordon-Levitt"],
        "Available Seats": 50
      },
      {
        "Movie name": "Avengers: Endgame",
        "Category": "Action",
        "Description": "The Avengers assemble once more to undo the damage caused by Thanos.",
        "Actors": ["Robert Downey Jr.", "Chris Evans", "Scarlett Johansson"],
        "Available Seats": 100
      },
      {
        "Movie name": "The Lion King",
        "Category": "Animation",
        "Description": "The story of a young lion prince overcoming adversity to claim his kingdom.",
        "Actors": ["Matthew Broderick", "James Earl Jones"],
        "Available Seats": 75
      }
    ];

    const count = await collection.countDocuments();
    if (count === 0) {
      await collection.insertMany(sampleMovies);
      console.log("✅ Sample data added to MovieCollection");
    }

    // Set views folder
    app.set("views", path.join(__dirname, "views"));

    // ------------------- ROUTES -------------------

    app.get("/", (req, res) => {
      res.sendFile(__dirname + "/template/wonderland.html");
    });

    // Admin login
    app.get("/views/admin-login.ejs", (req, res) => {
      res.render("admin-login");
    });

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

    app.get("/admin-dashboard", (req, res) => {
      res.sendFile(__dirname + "/template/movie-list.html");
    });

    // User login
    app.get("/views/login.ejs", (req, res) => {
      res.render("login");
    });

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

    app.get("/user-dashboard", (req, res) => {
      res.sendFile(__dirname + "/template/book-seats-form.html");
    });

    // HTML templates
    app.get("/add-movie-form.html", (req, res) => {
      res.sendFile(__dirname + "/template/add-movie-form.html");
    });
    app.get("/book-seats-form.html", (req, res) => {
      res.sendFile(__dirname + "/templates/book-seats-form.html");
    });
    app.get("/delete-movie-form.html", (req, res) => {
      res.sendFile(__dirname + "/templates/delete-movie-form.html");
    });
    app.get("/update-seats-form.html", (req, res) => {
      res.sendFile(__dirname + "/templates/update-seats-form.html");
    });

    // Lấy danh sách phim theo category
    app.get("/get-movies", async (req, res) => {
      const category = req.query.category;
      try {
        const movies = await collection.find({ Category: category }).toArray();
        res.status(200).json(movies);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch movies" });
      }
    });

    // Lấy tất cả phim
    app.get("/get-all-movies", async (req, res) => {
      try {
        const movies = await collection.find().toArray();
        res.status(200).json(movies);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch movies" });
      }
    });

    // Lấy chi tiết phim
    app.get("/get-movie-details", async (req, res) => {
      const movieName = req.query.name;
      try {
        const movie = await collection.findOne({ "Movie name": movieName });
        if (movie) {
          res.status(200).json({
            Description: movie.Description,
            Actors: movie.Actors,
          });
        } else {
          res.status(404).json({ error: "Movie not found" });
        }
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch movie details" });
      }
    });

    // Thêm phim
    app.post("/add-movie", async (req, res) => {
      try {
        await collection.insertOne(req.body);
        res.send('<script>alert("Movie added successfully"); window.location.href = "/admin-dashboard";</script>');
      } catch (error) {
        res.status(500).send("<h2>Failed to add movie</h2>");
      }
    });

    // Đặt ghế
    app.post("/book-seats", async (req, res) => {
      try {
        const isAdmin = req.isAuthenticated() && req.user.username === "Aptech";
        const movieNameToBook = req.body["Movie name"];
        const seatsToBook = parseInt(req.body["seats-to-book"]);

        const existingMovie = await collection.findOne({ "Movie name": movieNameToBook });
        if (!existingMovie) return res.send("Movie not found");

        const availableSeats = existingMovie["Available Seats"];
        if (seatsToBook <= availableSeats) {
          const updatedSeats = availableSeats - seatsToBook;
          const result = await collection.updateOne(
            { "Movie name": movieNameToBook },
            { $set: { "Available Seats": updatedSeats } }
          );

          const redirectRoute = isAdmin ? "/admin-dashboard" : "/user-dashboard";

          if (result.modifiedCount === 1) {
            return res.send(`
              <script>
                alert("Booking successful for ${seatsToBook} seat(s) in ${movieNameToBook}");
                window.location.href = "${redirectRoute}";
              </script>
            `);
          } else {
            return res.send(`
              <script>
                alert("Failed to update available seats");
                window.location.href = "${redirectRoute}";
              </script>
            `);
          }
        } else {
          res.send(`Not enough seats available for ${movieNameToBook}`);
        }
      } catch (error) {
        res.status(500).send("Failed to book seats");
      }
    });

    // Xóa phim
    app.post("/delete-movie", async (req, res) => {
      const movieNameToDelete = req.body["Movie name"];
      try {
        const existingMovie = await collection.findOne({ "Movie name": movieNameToDelete });
        if (!existingMovie) return res.send("Movie not found");

        const result = await collection.deleteOne({ "Movie name": movieNameToDelete });
        if (result.deletedCount === 1) {
          res.send('<script>alert("Movie deleted successfully"); window.location.href = "/admin-dashboard";</script>');
        } else {
          res.send('<script>alert("Failed to delete the movie"); window.location.href = "/";</script>');
        }
      } catch (error) {
        res.status(500).send("Failed to delete the movie");
      }
    });

    // Cập nhật số ghế
    app.post("/update-seats", async (req, res) => {
      const movieNameToUpdate = req.body["Movie name"];
      const newAvailableSeats = parseInt(req.body["Available Seats"]);
      try {
        const existingMovie = await collection.findOne({ "Movie name": movieNameToUpdate });
        if (!existingMovie) {
          return res.send('<script>alert("Movie not found"); window.location.href = "/";</script>');
        }
        const result = await collection.updateOne(
          { _id: existingMovie._id },
          { $set: { "Available Seats": newAvailableSeats } }
        );

        if (result.modifiedCount === 1) {
          res.send('<script>alert("Seats updated successfully"); window.location.href = "/admin-dashboard";</script>');
        } else {
          res.status(500).send("Failed to update available seats");
        }
      } catch (error) {
        res.status(500).send("Failed to update available seats");
      }
    });

    // Logout
    app.get("/logout", (req, res) => {
      res.sendFile(__dirname + "/template/wonderland.html");
    });

  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error);
  }
}

main().catch(console.error);

// Start server
app.listen(process.env.PORT || 3000, () => {
  console.log("Server is running on port 3000");
});
