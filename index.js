const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { format } = require('date-fns');
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
		const paymentCollection = database.collection('payments');
		const sliderCollection = database.collection('sliders');

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
			const query = { visibility: true };
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
		app.patch('/product/:uid', verifyJWT, verifyAdmin, async (req, res) => {
			const uid = req.params.uid;
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return;
			}
			const id = req.query.id;
			const filter = { _id: ObjectId(id) };
			const data = req.body;
			const updatedDoc = {
				$set: {
					'product_info.product_name': data.product_name,
					'product_info.product_description':
						data.product_description,
					'product_info.product_category': data.product_category,
					'product_info.product_image': data.product_image,
					'product_info.product_price': parseInt(data.product_price),
					'product_info.product_quantity': parseInt(
						data.product_quantity
					),
				},
			};
			const result = await productCollection.updateOne(
				filter,
				updatedDoc
			);
			res.send(result);
		});

		app.delete(
			'/product/:uid',
			verifyJWT,
			verifyAdmin,
			async (req, res) => {
				const uid = req.params.uid;
				const valid = verifyAuthorization(req, res, uid);
				if (!valid) {
					return;
				}
				const id = req.query.id;
				const query = { _id: ObjectId(id) };
				const result = await productCollection.deleteOne(query);
				res.send(result);
			}
		);
		app.patch(
			'/product-visibility/:uid',
			verifyJWT,
			verifyAdmin,
			async (req, res) => {
				const uid = req.params.uid;
				const valid = verifyAuthorization(req, res, uid);
				if (!valid) {
					return;
				}
				const id = req.query.id;
				const filter = { _id: ObjectId(id) };
				const visibility = req.body.visibility;
				const option = { upsert: true };
				const updatedDoc = {
					$set: {
						visibility: visibility,
					},
				};
				const result = await productCollection.updateOne(
					filter,
					updatedDoc,
					option
				);
				res.send(result);
			}
		);
		//users
		app.post('/users', async (req, res) => {
			const user = req.body;
			const query = { uid: user.uid };
			const exit = await userCollection.findOne(query);
			if (exit?.uid === user.uid) {
				return res.send({ message: 'User Already has' });
			}
			const result = await userCollection.insertOne(user);
			res.send(result);
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
		// app.get('/get-orders/:uid', verifyJWT, async (req, res) => {
		// 	const uid = req.params.uid;
		// 	const id = req.params.
		// 	const valid = verifyAuthorization(req, res, uid);
		// 	if (!valid) {
		// 		return;
		// 	}
		// 	const orders = await orderCollection.findOne({ customer_uid: uid });
		// 	res.send(orders);
		// });

		//Create Payment Intent
		app.post('/create-payment-intent/:uid', verifyJWT, async (req, res) => {
			const uid = req.params.uid;
			const id = req.query.id;
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return;
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
				return;
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
					order_status: 'processing',
					address: payment.address,
					transactionId: payment.transactionId,
				},
			};
			const orderResult = await orderCollection.updateOne(
				orderQuery,
				orderUpdatedDoc,
				option
			);
			const ordered_products = payment.ordered_products;
			for (let i = 0; i < ordered_products.length; i++) {
				const element = ordered_products[i];
				const elementQuery = { _id: ObjectId(element[0]) };
				const elementQuantity = element[1];
				const product = await productCollection.findOne(elementQuery);
				// const elementOption = {upsert:true}
				const updatedDoc = {
					$set: {
						'product_info.product_quantity':
							parseInt(product.product_info.product_quantity) -
							parseInt(elementQuantity),
						'product_info.totalSale':
							parseInt(product.product_info.totalSale) +
							parseInt(elementQuantity),
					},
				};
				const result = await productCollection.updateOne(
					elementQuery,
					updatedDoc
				);
			}

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
		//Get all customer order
		app.get(
			'/customers-order/:uid',
			verifyJWT,
			verifyAdmin,
			async (req, res) => {
				const uid = req.params.uid;
				const query = {};
				const valid = verifyAuthorization(req, res, uid);
				if (!valid) {
					return;
				}
				const orders = await orderCollection.find(query).toArray();
				const shippedCount = await orderCollection.countDocuments({
					order_status: 'shipped',
				});
				const processingCount = await orderCollection.countDocuments({
					order_status: 'processing',
				});
				const paymentPendingCount =
					await orderCollection.countDocuments({
						order_status: 'payment pending',
					});

				res.send({
					orders,
					count: {
						processingCount,
						shippedCount,
						paymentPendingCount,
					},
				});
			}
		);
		app.get('/my-order/:uid', verifyJWT, async (req, res) => {
			const uid = req.params.uid;
			const query = { customer_uid: uid };
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return;
			}
			const orders = await orderCollection.find(query).toArray();
			res.send(orders);
		});
		//Get an Order
		app.get('/order/:uid', verifyJWT, async (req, res) => {
			const uid = req.params.uid;
			const id = req.query.id;
			const query = { _id: ObjectId(id) };
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return;
			}
			const order = await orderCollection.findOne(query);
			res.send(order);
		});

		//Update order status
		app.patch(
			'/update-status/:uid',
			verifyJWT,
			verifyAdmin,
			async (req, res) => {
				const uid = req.params.uid;
				const valid = verifyAuthorization(req, res, uid);
				if (!valid) {
					return;
				}
				const id = req.query.id;
				const status = req.query.status;
				const query = { _id: ObjectId(id) };
				const updatedDoc = {
					$set: {
						order_status: status,
					},
				};
				const option = { upsert: true };
				const result = await orderCollection.updateOne(
					query,
					updatedDoc,
					option
				);
				res.send(result);
			}
		);
		//Sales
		app.get(
			'/sales-report/:uid',
			verifyJWT,
			verifyAdmin,
			async (req, res) => {
				const uid = req.params.uid;
				const valid = verifyAuthorization(req, res, uid);
				if (!valid) {
					return;
				}
				const sales = await paymentCollection
					.find({})
					.sort({ createAt: -1 })
					.toArray();
				res.send(sales);
			}
		);

		//Top Sales
		// app.get('/top-sales', async (req, res) => {
		// 	const products = await productCollection
		// 		.find({})
		// 		.sort({ 'product_info.totalSale': -1 })
		// 		.limit(5)
		// 		.toArray();
		// 	res.send(products);
		// });
		//Recent Product Added
		// app.get('/recent-products', async (req, res) => {
		// 	const products = await productCollection
		// 		.find({})
		// 		.sort({ createAt: -1 })
		// 		.limit(5)
		// 		.toArray();
		// 	res.send(products);
		// });

		//Monthly Sales Report
		// app.get(
		// 	'/monthly-sales-report/:uid',
		// 	verifyJWT,
		// 	verifyAdmin,
		// 	async (req, res) => {
		// 		const uid = req.params.uid;
		// 		const valid = verifyAuthorization(req, res, uid);
		// 		if (!valid) {
		// 			return;
		// 		}
		// 		const allSales = await paymentCollection.find({}).toArray();
		// 		// const report = allSales.map(sale => {
		// 		// 	return {}
		// 		// })
		// 		const result = allSales.reduce((prev, curr) => {
		// 			if (!prev[format(new Date(curr.createAt), 'P')]) {
		// 				prev[format(new Date(curr.createAt), 'P')] = 0;
		// 			}
		// 			prev[format(new Date(curr.createAt), 'P')] += curr.price;
		// 			return prev;
		// 		}, {});
		// 		const data = [];
		// 		for (const key in result) {
		// 			const income = result[key];
		// 			data.push({ date: key, income });
		// 		}
		// 		res.send(data);
		// 	}
		// );
		app.get('/sliders', async (req, res) => {
			const query = {};
			const sliders = await sliderCollection
				.find(query)
				.limit(3)
				.toArray();
			res.send(sliders);
		});
		app.post('/sliders', verifyJWT, verifyAdmin, async (req, res) => {
			const uid = req.query.uid;
			const valid = verifyAuthorization(req, res, uid);
			if (!valid) {
				return;
			}
			const slide = req.body;
			const result = await sliderCollection.insertOne(slide);
			console.log(result);
			res.send(result);
		});

		app.get('/top-categories', async (req, res) => {
			const query = {};
			const categories = await categoryCollection
				.find(query)
				.limit(3)
				.toArray();
			res.send(categories);
		});
		app.get('/category-products/:slug', async (req, res) => {
			const slug = req.params.slug;
			const query = { slug: slug };
			const category = await categoryCollection.findOne(query);
			const products = await productCollection
				.find({ 'product_info.category_slug': slug })
				.toArray();
			res.send({ category_name: category.name, products: products });
		});

		app.get(
			'/dashboard-data/:uid',
			verifyJWT,
			verifyAdmin,
			async (req, res) => {
				const uid = req.params.uid;
				const valid = verifyAuthorization(req, res, uid);
				if (!valid) {
					return;
				}

				const topSellingProducts = await productCollection
					.find({})
					.sort({ 'product_info.totalSale': -1 })
					.limit(5)
					.toArray();
				const recentProducts = await productCollection
					.find({})
					.sort({ createAt: -1 })
					.limit(5)
					.toArray();
				const monthlyAllSales = await paymentCollection
					.find({})
					.toArray();
				// const report = allSales.map(sale => {
				// 	return {}
				// })
				const totalMonthlySales = monthlyAllSales.reduce(
					(prev, curr) => {
						if (!prev[format(new Date(curr.createAt), 'P')]) {
							prev[format(new Date(curr.createAt), 'P')] = 0;
						}
						prev[format(new Date(curr.createAt), 'P')] +=
							curr.price;
						return prev;
					},
					{}
				);
				const monthlyChartData = [];
				for (const key in totalMonthlySales) {
					const income = totalMonthlySales[key];
					monthlyChartData.push({ date: key, income });
				}
				const totalOrder =
					await orderCollection.estimatedDocumentCount();
				const totalProducts =
					await productCollection.estimatedDocumentCount();
				const todayDate = format(new Date(), 'P');
				const todaySale = monthlyChartData.find(
					(chart) => chart.date === todayDate
				);
				res.send({
					topSellingProducts,
					recentProducts,
					monthlyChartData,
					totalOrder,
					totalProducts,
					todaySale: todaySale?.income,
				});
			}
		);
	} finally {
	}
};
run().catch((err) => console.log(err));

app.listen(port, () => {
	console.log(`Niyenow server is running on ${port}`);
});
