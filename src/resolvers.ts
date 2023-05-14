// Import necessary models and packages
import { Order } from "./models/order";
import { User } from "./models/user";
import { Product } from "./models/product";
import { Cart, CartItem } from "./models/cart";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
export const stripe = require("stripe")(
  "sk_test_51MxUhMSJZw37cboEifpinxY9EjrkkJEOrhLSw7Wwtx5VCOp73W9FiJc0kIwb3xmKkWutRQrQtaCCZS3WOHpQeDHP004TCopGAI",
  {
    apiVersion: "2022-11-15",
  }
);
import { addToCart } from "./functionshandler/addToCart";
import { updateCartItem } from "./functionshandler/updateCartItem";

// Hash the password using bcrypt

// Import necessary input types from schema file
import {
  CreateOrderInput,
  ProductInput,
  UserInput,
  UpdateProductInput,
  UpdateOrderStatusInput,
} from "./schema";

// Set JWT_SECRET for authentication
const JWT_SECRET = "secret";

// Define resolvers
export const resolvers = {
  Query: {
    // Query to retrieve all products
    products: async () => {
      const products = await Product.find();
      return products;
    },

    // Query to retrieve all carts
    cart: async () => {
      const cart = await Cart.find().populate("user items.product");
      return cart;
    },

    // Query to retrieve a specific cart by its ID
    getCart: async (_: unknown, { id }: { id: string }) => {
      return await Cart.findById(id).populate("user items.product");
    },

    // Query to retrieve a specific product by its ID
    getProduct: async (_: unknown, { id }: { id: string }) => {
      console.log(id);
      const getProduct = await Product.findById(id);
      return getProduct;
    },

    // Query to retrieve all orders
    orders: async () => {
      const orders = await Order.find().populate("user items.product");
      return orders;
    },

    // Query to retrieve a specific order by its ID
    order: async (_: unknown, { id }: { id: string }) => {
      const order = (await Order.findById(id)).populate("user items.product");
      return order;
    },

    // Query to retrieve all orders for a specific user by their ID
    userOrders: async (_: unknown, { userId }: { userId: string }) => {
      const orders = await Order.find({ user: userId }).populate(
        "user items.products"
      );
      return orders;
    },
  },

  // Define mutation resolvers
  Mutation: {
    // Mutation to create a new product
    createProduct: async (
      _: unknown,
      { input }: { input: ProductInput },
      context: any
    ) => {
      // Check for admin authentication
      if (!context || !context.user || !context.user.admin) {
        throw new Error("Unauthorized");
      }

      console.log(`@@@@@@@@@@@@@@@@@@`, context.user.admin);
      // Extract product details from input
      const { name, description, price, image } = input;

      // Create new product object
      const product = new Product({ name, description, price, image });

      // Save new product object to database
      await product.save();

      // Return the newly created product object
      return product;
    },

    // Mutation to update an existing product
    updateProduct: async (
      _: unknown,
      { input }: { input: UpdateProductInput },
      context: any
    ) => {
      // Check for authentication
      if (!context) {
        throw new Error("Authentication required");
      }
      // Extract product details from input
      const { id, name, description, price, image } = input;
      // Find the product to update by its ID and update its details
      const product = await Product.findByIdAndUpdate(
        id,
        { name, description, price, image },
        { new: true }
      );
      // Return the updated product object
      return product;
    },

    // Mutation to delete an existing product
    deleteProduct: async (_: unknown, { id }: { id: string }, context: any) => {
      // Check for authentication
      if (!context) {
        throw new Error("Authentication required");
      }
      // Find the product to delete by its ID and delete it
      const deleteProduct = await Product.findByIdAndDelete(id);
      // Check if product was not found
      if (!deleteProduct) {
        return {
          message: "Product already deleted",
        };
      }
      // Return success message
      return {
        message: "Product deleted",
      };
    },

    // This function add product to the cart
    addToCart: async (_: unknown, { productId, quantity }, { user }) => {
      // Log the user object to ensure it exists
      console.log("user", user);

      try {
        // Check if the user exists and has an ID
        if (!user || !user.id) {
          throw new Error("invalid user");
        }

        return await addToCart(productId, quantity, user.id);
      } catch (error) {
        console.error(error);
        throw new Error("Failed to add item to cart");
      }
    },

    // This function updates the quantity of a cart item for the user
    updateCartItem: async (_, { cartItemId, quantity }, { user }) => {
      try {
        // Check if the user exists and has an ID
        if (!user || !user.id) {
          throw new Error("invalid user");
        }
        return await updateCartItem(cartItemId, quantity, user.id);
      } catch (error) {
        console.error(error);
        throw new Error("Failed to update cart item");
      }
    },

    // This function removes the quantity of a cart item for the user
    async removeCartItem(_: unknown, { cartItemId }, { user }) {
      console.log(cartItemId);
      try {
        // Check if the user is valid and has an ID
        if (!user || !user.id) {
          throw new Error("Invalid user");
        }

        // Get the user's cart
        const cart = await Cart.findOne({ user: user.id }).populate(
          "items.product"
        );

        // Find the item in the cart
        const itemIndex = cart.items.findIndex(
          (item) => item.id.toString() === cartItemId
        );

        // If the item is not in the cart, throw an error
        if (itemIndex === -1) {
          throw new Error("Cart item not found");
        }

        // Remove the item from the cart
        cart.items.splice(itemIndex, 1);

        // Recalculate the total price of the cart
        cart.totalPrice = cart.items.reduce(
          (total, item) => total + item.price * item.quantity,
          0
        );
        console.log(cart.totalPrice);
        // Save the cart
        await cart.save();

        // Return the updated cart
        return await cart.populate("items.product");
      } catch (error) {
        console.error(error);
        throw new Error("Failed to remove item from cart");
      }
    },

    createOrder: async (
      _: unknown,
      { input }: { input: CreateOrderInput },
      { user }
    ) => {
      const { items, status } = input;
      try {
        if (!user || !user.id) {
          throw new Error("Invalid user");
        }

        // Get the user's cart
        const cart = await Cart.findOne({ user: user.id }).populate(
          "items.product"
        );

        console.log(cart);
        if (!cart) {
          throw new Error("Cart not found");
        }
        const orderItems = cart.items.map((item) => item.id);
        // create the new order
        const order = new Order({
          items: orderItems,
          user,
          status,
          totalPrice: cart.totalPrice,
          createdAt: new Date().toISOString(),
        });

        // save the order in the database
        await order.save();
        // Clear the user's cart by deleting all items
        cart.items.splice(0, cart.items.length);
        cart.totalPrice = 0;
        await cart.save();

        return await order.populate("user items.product");
      } catch (error) {
        console.error(error);
        throw new Error("Failed to create order");
      }
    },
    async updateOrderStatus(
      _: unknown,
      { input }: { input: UpdateOrderStatusInput },
      { user }
    ) {
      const { id, status } = input;

      try {
        // Check if the user is valid and has an ID
        if (!user || !user.id) {
          throw new Error("Invalid user");
        }

        // Update the status of the order
        const order = await Order.findByIdAndUpdate(
          id,
          { status },
          { new: true }
        );

        // If the order is not found, throw an error
        if (!order) {
          throw new Error(`Order with id ${id} not found`);
        }

        // Return the updated order and a success message
        return {
          message: "Updated Sucessfully",
        };
      } catch (error) {
        console.error(error);
        throw new Error("Failed to update order");
      }
    },

    // Deletes an order with the specified id
    deleteOrder: async (_: unknown, { id }: { id: string }, { user }) => {
      try {
        // Check if the user is authenticated
        if (!user || !user.id) {
          throw new Error("Invalid user");
        }

        // Find and delete the order with the specified id
        const order = await Order.findByIdAndDelete(id);
        if (!order) {
          throw new Error(`Order with id ${id} not found`);
        }
        return {
          message: "Order deleted successfully",
        };
      } catch (error) {
        console.error(error);
        throw new Error("Failed to delete order");
      }
    },

    async createPaymentIntent(
      _: unknown,
      { orderId }: { orderId: string },
      context: any
    ) {
      try {
        // Retrieve the order from the database
        const order = await Order.findById(orderId).populate("user");

        // Check if the user is authorized to complete the payment
        if (!context || !context.user) {
          throw new Error("Not authorized to complete payment for this order");
        }
        // Create a payment method
        const paymentMethod = await stripe.paymentMethods.create({
          type: "card",
          card: {
            number: "4242424242424242",
            exp_month: 12,
            exp_year: 2041,
            cvc: "123",
          },
          billing_details: {
            name: context.user.name,
            email: context.user.email,
          },
        });

        // Calculate the order amount
        const amount = order.totalPrice * 100; // amount in the smallest currency unit
        const currency = "INR";
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency,
          payment_method_types: ["card"],
          payment_method: paymentMethod.id,
          payment_method_options: {
            card: {
              request_three_d_secure: "any",
            },
          },
          confirm: true,
        });
        console.log(
          `%%%%%%%%%%%%`,
          paymentIntent.next_action.use_stripe_sdk.stripe_js
        );

        return {
          clientSecret: paymentIntent.client_secret,
          id: paymentIntent.id,
          click_Here_To_MakePayment:
            paymentIntent.next_action.use_stripe_sdk.stripe_js,
        };
      } catch (error) {
        console.error(error);
        throw new Error("Failed to create payment intent");
      }
    },

    signOut: async (
      _: unknown, // The parent value of this resolver function, which is not used here
      __: unknown, // The arguments passed to this function, which is not used here
      { user } // The context object, which should include the current authenticated user
    ) => {
      // Ensure that there is a current user
      if (!user) {
        throw new Error("User not authenticated");
      }
      // Return a message indicating that the user has been signed out
      return true;
    },
    signUp: async (_, { input }) => {
      const {
        name,
        email,
        password,
        isAdmin = false,
        phoneNumber,
        shippingAddress,
        billingAddress,
      } = input;

      // Check if a user with the same email already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new Error("User already exists");
      }

      // Hash the password using bcrypt
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create a new user with the provided name, email, hashed password, and shipping address
      const user = new User({
        name,
        email,
        password: hashedPassword,
        isAdmin,
        phoneNumber,
        shippingAddress,
        billingAddress,
      });
      await user.save();

      // Generate a JWT token for the user using the user ID as the payload
      const token = jwt.sign({ userId: user.id }, "secret", {
        algorithm: "HS256",
      });

      // Return an object that contains the JWT token, user object, and a message
      return { token, user, message: "User Created" };
    },
    // This function handles user sign up process
    // It takes user's name, email, and password as parameters
    // It returns an object that contains a JWT token, user ID, and a message
    signIn: async (
      _: unknown, // The parent value of this resolver function, which is not used here
      { email, password }: { email: string; password: string } // The arguments passed to this function
    ) => {
      // Find a user with the provided email
      const user = await User.findOne({ email });
      if (!user) {
        throw new Error("Invalid email or password");
      }

      // Compare the provided password with the hashed password in the database using bcrypt
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        throw new Error("Invalid email or password");
      }

      // Generate a JWT token for the user using the user ID as the payload
      const token = jwt.sign({ userId: user.id }, JWT_SECRET);

      // Log the JWT token (for testing purposes)
      console.log(jwt.sign({ userId: user.id }, JWT_SECRET));

      // Return an object that contains the JWT token, user ID, and a message
      return { token, id: user.id, message: "User Logged In" };
    },
  },
};
