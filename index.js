const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { json } = require("express/lib/response");
const jwt = require("jsonwebtoken");

require("dotenv").config();
const port = process.env.PORT || 5000;

const app = express();

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fb2rty6.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// const imgHost = process.env.REACT_APP_imgbb_key;
// console.log(imgHost);

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const servicesOptions = client.db("doctorsPortal").collection("services");
    const bookingsOption = client.db("doctorsPortal").collection("bookings");
    const usersOption = client.db("doctorsPortal").collection("users");
    const doctorsOption = client.db("doctorsPortal").collection("doctors");

    app.get("/services", async (req, res) => {
      const query = {};
      const options = await servicesOptions.find(query).toArray();
      const date = req.query.date;
      const optionQuery = { appointment: date };
      const alreadyBooked = await bookingsOption.find(optionQuery).toArray();
      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (book) => book.treatment === option.name
        );
        const bookedSlots = optionBooked.map((book) => book.slot);
        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        option.slots = remainingSlots;
      });
      res.send(options);
    });

    app.get("/v2/services", async (req, res) => {
      const date = req.query.date;
      const options = await servicesOptions
        .aggregate([
          {
            $lookup: {
              from: "bookings",
              localField: "name",
              foreignField: "treatment",
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["$appointment", date],
                    },
                  },
                },
              ],
              as: "booked",
            },
          },
          {
            $project: {
              name: 1,
              price: 1,
              slots: 1,
              booked: {
                $map: {
                  input: "$booked",
                  as: "book",
                  in: "$$book.slot",
                },
              },
            },
          },
          {
            $project: {
              name: 1,
              price: 1,
              slots: {
                $setDifference: ["$slots", "$booked"],
              },
            },
          },
        ])
        .toArray();
      res.send(options);
    });

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersOption.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1h",
        });
        res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
    });

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersOption.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });

    app.post("/users", async (req, res) => {
      const users = req.body;
      const result = await usersOption.insertOne(users);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const query = {};
      const result = await usersOption.find(query).toArray();
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const user = await usersOption.deleteOne(query);
      res.send(user);
    });

    app.put("/users/admin/:id", verifyJWT, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersOption.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const option = { upsert: true };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersOption.updateOne(filter, updatedDoc, option);
      res.send(result);
    });

    app.get("/addPrice", async (req, res) => {
      const filter = {};
      const option = { upsert: true };
      const updatedDoc = {
        $set: {
          price: 99,
        },
      };
      const result = await servicesOptions.updateMany(
        filter,
        updatedDoc,
        option
      );
      res.send(result);
    });

    app.get("/appointmentSpecialty", async (req, res) => {
      const query = {};
      const result = await servicesOptions
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });

    app.get("/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const bookings = await bookingsOption.find(query).toArray();
      res.send(bookings);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      const query = {
        appointment: booking.appointment,
        email: booking.email,
        treatment: booking.treatment,
      };
      const alreadyBooked = await bookingsOption.find(query).toArray();

      if (alreadyBooked.length) {
        const message = `You already have a booking on ${booking.appointment}`;
        return res.send({ acknowledged: false, message });
      }
      const result = await bookingsOption.insertOne(booking);
      res.send(result);
    });

    app.get("/doctors", async (req, res) => {
      const query = {};
      const doctors = await doctorsOption.find(query).toArray();
      res.send(doctors);
    });

    app.post("/doctors", async (req, res) => {
      const doctor = req.body;
      const result = await doctorsOption.insertOne(doctor);
      res.send(result);
    });

    app.delete("/doctors/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await doctorsOption.deleteOne(query);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.log);

app.get("/", async (req, res) => {
  res.send("Doctors portal is running ");
});

app.listen(port, () => console.log(`doctors portal running on ${port}`));
