const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
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

async function run() {
  try {
    const servicesOptions = client.db("doctorsPortal").collection("services");
    const bookingsOption = client.db("doctorsPortal").collection("bookings");

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
  } finally {
  }
}
run().catch(console.log);

app.get("/", async (req, res) => {
  res.send("Doctors portal is running ");
});

app.listen(port, () => console.log(`doctors portal running on ${port}`));
