const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);

//Middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
	res.send('NiyeNow server is running');
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z9hjm.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
	serverApi: ServerApiVersion.v1,
});

const verifyJWT = (req, res, next) => {
	const authHead = req.headers.authorization;
	if (!authHead) {
		return res.status(401).send({ code: 401, message: 'Access Denied' });
	}
	const token = authHead.split(' ')[1];
	jwt.verify(token, process.env.JWT_SECRET_TOKEN, (err, decoded) => {
		if (err) {
			return res
				.status(403)
				.send({ code: 403, message: 'Access Forbidden' });
		}
		req.decoded = decoded;
	});
	next();
};

const verifyAuthorization = (req, res, uid) => {
	const decoded = req.decoded;
	if (uid !== decoded.uid) {
		res.status(403).send({ code: 403, message: 'Access Forbidden' });
		return false;
	}
	return true;
};

const run = async () => {
	try {
		const database = client.db('niyenowDB');
		const productCollection = database.collection('products');
		const userCollection = database.collection('users');
		const categoryCollection = database.collection('categories');
		const cartCollection = database.collection('carts');
		const orderCollection = database.collection('orders');
		const paymentCollection = database.collection('payments')

		//VerifyAdmin
		const verifyAdmin = async (req, res, next) => {
			const decoded = req.decoded;
			const query = { uid: decoded?.uid };
			const user = await userCollection.findOne(query);
			if (user.role !== 'admin') {
				return res
					.status(403)
					.send({ code: 403, message: 'Access Forbidden' });
			} else {
				next();
			}
		};
		//GET JWT TOKEN
		app.get('/jwt', (req, res) => {
			const uid = req.query.uid;
			const token = jwt.sign({ uid }, process.env.JWT_SECRET_TOKEN);
			res.send({ token });
		});
		//product operation
		app.get('/products', async (req, res) => {
			const query = {};
			const products = await productCollection.find(query).toArray();
			res.send(products);
		});
		app.get('/product/:id', async (req, res) => {
			const id = req.params.id;
			const query = { _id: ObjectId(id) };
			const product = await productCollection.findOne(query);
			res.send(product);
		});
		app.post('/product', verifyJWT, verifyAdmin, async (req, res) => {
			const uid = req.query.uid;
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return;
			}
			const product = req.body;
			const result = await productCollection.insertOne(product);
			res.send(result);
		});

		//users
		app.post('/users', async (req, res) => {
			const user = req.body;
			const query = { uid: user.uid };
			const exit = await userCollection.findOne(query);
			if (exit) {
				return;
			}
			const result = await userCollection.insertOne(user);
			res.send(result);
			console.log(user);
			console.log(result);
		});

		//Admin
		app.get('/admin', async (req, res) => {
			const uid = req.query.uid;
			const query = { uid: uid };
			const user = await userCollection.findOne(query);
			res.send({ role: user.role });
		});
		app.get(
			'/admin-products/:uid',
			verifyJWT,
			verifyAdmin,
			async (req, res) => {
				const uid = req.params.uid;
				const valid = verifyAuthorization(req, res, uid);
				if (!valid) {
					return;
				}
				const query = { 'seller_info.seller_uid': uid };
				const products = await productCollection.find(query).toArray();
				res.send(products);
			}
		);

		//cart
		app.post('/add-to-cart/:uid', verifyJWT, async (req, res) => {
			const uid = req.params.uid;
			const order = req.body;
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return;
			}
			const result = await cartCollection.insertOne(order);
			res.send(result);
		});
		app.get('/get-cart/:uid', verifyJWT, async (req, res) => {
			const uid = req.params.uid;
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return;
			}
			const query = { uid };
			const cart = await cartCollection.find(query).toArray();
			res.send(cart);
		});
		app.delete('/delete-cart/:uid', verifyJWT, async (req, res) => {
			const uid = req.params.uid;
			const id = req.query.id;
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return;
			}
			const query = { _id: ObjectId(id) };
			const result = await cartCollection.deleteOne(query);
			res.send(result);
		});

		//Categories
		app.get('/categories', async (req, res) => {
			const query = {};
			const categories = await categoryCollection.find(query).toArray();
			res.send(categories);
		});
		app.post('/categories', verifyJWT, verifyAdmin, async (req, res) => {
			const uid = req.query.uid;
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return;
			}
			const category = req.body;
			const result = await categoryCollection.insertOne(category);
			res.send(result);
			console.log('gg');
		});

		//Customer
		app.get('/customers/:uid', verifyJWT, verifyAdmin, async (req, res) => {
			const uid = req.params.uid;
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return;
			}
			const query = { role: 'customer' };
			const customers = await userCollection.find(query).toArray();
			console.log(customers);
			res.send(customers);
		});

		//Confirm Order
		app.post('/confirm-order/:uid', verifyJWT, async (req, res) => {
			const uid = req.params.uid;
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return;
			}
			const order = req.body;
			const result = await orderCollection.insertOne(order);
			res.send(result);
			const deleteCart = await cartCollection.deleteMany({ uid });
		});
		//get orders
		app.get('/get-orders/:uid', verifyJWT, async (req, res) => {
			const uid = req.params.uid;
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return;
			}
			const orders = await orderCollection.findOne({ customer_uid: uid });
			res.send(orders);
		});

		//Create Payment Intent
		app.post('/create-payment-intent/:uid', verifyJWT, async (req, res) => {
			const uid = req.params.uid;
			const id = req.query.id;
			const valid = verifyAuthorization(req, res, uid)
			if (!valid) {
				return
			}
			const query = { _id: ObjectId(id) };
			const order = await orderCollection.findOne(query);
			const price = order.subTotal;
			const paymentIntent = await stripe.paymentIntents.create({
				amount: price,
				currency: 'usd',
				payment_method_types: ['card'],
			});
			res.send({ clientSecret: paymentIntent.client_secret });
		});

		//save payment data to database
		app.post('/payments/:uid', verifyJWT, async (req, res) => {
			const uid = req.params.uid;
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return
			}
			const payment = req.body;
			const result = await paymentCollection.insertOne(payment);
			res.send(result);
			//set order status true after payment done
			const orderQuery = { _id: ObjectId(payment.orderId) };
			const option = { upsert: true };
			const orderUpdatedDoc = {
				$set: {
					payment_status: true,
				},
			};
			const orderResult = await orderCollection.updateOne(
				orderQuery,
				orderUpdatedDoc,
				option
			);
			//set order status true and promote status false after payment done
			// const productQuery = { _id: ObjectId(payment.product_id) };
			// const productUpdatedDoc = {
			// 	$set: {
			// 		order_status: true,
			// 		promote: false,
			// 	},
			// };
			// const productResult = await productCollection.updateOne(
			// 	productQuery,
			// 	productUpdatedDoc,
			// 	option
			// );
		});
	} finally {
	}
};
run().catch((err) => console.log(err));

app.listen(port, () => {
	console.log(`Niyenow server is running on ${port}`);
});
