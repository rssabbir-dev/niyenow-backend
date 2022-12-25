const express = require('express');
const app = express();
const cors = require('cors')
require('dotenv').config();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');

//Middleware
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.send('NiyeNow server is running')
})

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z9hjm.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
	serverApi: ServerApiVersion.v1,
});

const run = async () => {
    try {
        const database = client.db('niyenowDB')
        const productCollection = database.collection('products')
    }
    finally {
        
    }
}
run().catch(err => console.log(err))

app.listen(port, () => {
    console.log(`Niyenow server is running on ${port}`);
})