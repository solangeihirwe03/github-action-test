/* eslint-disable no-case-declarations */
/* eslint-disable curly */
/* eslint-disable comma-dangle */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import Joi from "joi";
import { NextFunction, Request, Response } from "express";
import authRepositories from "../modules/auth/repository/authRepositories";
import Users, { usersAttributes } from "../databases/models/users";
import httpStatus from "http-status";
import {
  comparePassword,
  decodeToken,
  generateOTP,
  generateRandomCode,
  hashPassword,
} from "../helpers";
import productRepositories from "../modules/product/repositories/productRepositories";
import Shops from "../databases/models/shops";
import Products from "../databases/models/products";
import { ExtendRequest, IExtendedCartProduct } from "../types";
import { sendEmail } from "../services/sendEmail";
import { Op } from "sequelize";

const currentDate = new Date();

import cartRepositories from "../modules/cart/repositories/cartRepositories";
import db from "../databases/models";
import userRepositories from "../modules/user/repository/userRepositories";
import { generateOtpEmailTemplate } from "../services/emailTemplate";

const validation =
  (schema: Joi.ObjectSchema | Joi.ArraySchema) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { error } = schema.validate(req.body, { abortEarly: false });

        if (error) {
          throw new Error(
            error.details
              .map((detail) => detail.message.replace(/"/g, ""))
              .join(", ")
          );
        }
        return next();
      } catch (error) {
        res
          .status(httpStatus.BAD_REQUEST)
          .json({ status: httpStatus.BAD_REQUEST, message: error.message });
      }
    };

const isUserExist = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let userExists: usersAttributes | null = null;

    if (req.body.email) {
      userExists = await authRepositories.findUserByAttributes(
        "email",
        req.body.email
      );
      if (userExists) {
        if (userExists.isVerified) {
          return res.status(httpStatus.BAD_REQUEST).json({
            status: httpStatus.BAD_REQUEST,
            message: "Account already exists.",
          });
        }
        return res.status(httpStatus.BAD_REQUEST).json({
          status: httpStatus.BAD_REQUEST,
          message: "Account already exists. Please verify your account",
        });
      }
    }

    if (req.params.id) {
      userExists = await authRepositories.findUserByAttributes(
        "id",
        req.params.id
      );
      if (userExists) {
        return next();
      }
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ status: httpStatus.NOT_FOUND, message: "User not found" });
    }

    return next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const isUsersExist = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userCount = await Users.count();
    if (userCount === 0) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({
          status: httpStatus.NOT_FOUND,
          message: "No users found in the database.",
        });
    }
    next();
  } catch (err) {
    res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: "Internet Server error.",
      });
  }
};

const isAccountVerified = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    let user: any = null;
    if (req?.params?.token) {
      const decodedToken = await decodeToken(req.params.token);
      user = await authRepositories.findUserByAttributes("id", decodedToken.id);
    }
    if (req?.body?.email) {
      user = await authRepositories.findUserByAttributes(
        "email",
        req.body.email
      );
    }

    if (!user) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ status: httpStatus.NOT_FOUND, message: "Account not found." });
    }

    if (user.isVerified) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json({
          status: httpStatus.BAD_REQUEST,
          message: "Account already verified.",
        });
    }

    const session = await authRepositories.findSessionByAttributes(
      "userId",
      user.id
    );
    if (!session) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json({ status: httpStatus.BAD_REQUEST, message: "Invalid token." });
    }

    req.session = session;
    req.user = user;
    next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const verifyUserCredentials = async (
  req: ExtendRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await authRepositories.findUserByAttributes(
      "email",
      req.body.email
    );
    if (!user) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json({
          status: httpStatus.BAD_REQUEST,
          message: "Invalid Email or Password",
        });
    }
    if (user.is2FAEnabled) {
      const { otp, expirationTime } = generateOTP();
      const device: any = req.headers["user-device"] || null;

      const session = {
        userId: user.id,
        device,
        otp: otp,
        otpExpiration: expirationTime,
      };

      await authRepositories.createSession(session);
      await sendEmail(
        user.email,
        "E-Commerce Ninja Login",
        generateOtpEmailTemplate(user, otp)
      );

      const isTokenExist = await authRepositories.findTokenByDeviceIdAndUserId(
        device,
        user.id
      );
      if (isTokenExist) {
        return res.status(httpStatus.OK).json({
          message: "Check your Email for OTP Confirmation",
          data: {
            UserId: user.id,
            token: isTokenExist,
          },
        });
      }

      return res.status(httpStatus.OK).json({
        status: httpStatus.OK,
        message: "Check your Email for OTP Confirmation",
        data: { userId: user.id },
      });
    }
    const passwordMatches = await comparePassword(
      req.body.password,
      user.password
    );
    if (!passwordMatches) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json({
          status: httpStatus.BAD_REQUEST,
          message: "Invalid Email or Password",
        });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      });
  }
};

const verifyUser = async (req: any, res: Response, next: NextFunction) => {
  try {
    let user: any = null;
    if (req?.params?.token) {
      const decodedToken = await decodeToken(req.params.token);
      user = await authRepositories.findUserByAttributes("id", decodedToken.id);
    }
    if (req?.body?.email) {
      user = await authRepositories.findUserByAttributes(
        "email",
        req.body.email
      );
    }

    if (!user) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ status: httpStatus.NOT_FOUND, message: "Account not found." });
    }
    if (!user.isVerified) {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: httpStatus.BAD_REQUEST,
        message: "Account is not verified.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const isSessionExist = async (req: any, res: Response, next: NextFunction) => {
  try {
    const session = await authRepositories.findSessionByAttributes(
      "userId",
      req.user.id
    );
    if (!session) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json({ status: httpStatus.BAD_REQUEST, message: "Invalid token." });
    }
    const destroy = await authRepositories.destroySessionByAttribute(
      "userId",
      req.user.id,
      "token",
      session.token
    );
    if (destroy) {
      const hashedPassword = await hashPassword(req.body.password);
      req.user.password = hashedPassword;
      next();
    }
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const isProductExist = async (req: any, res: Response, next: NextFunction) => {
  try {
    const shop = await productRepositories.findShopByAttributes(
      Shops,
      "userId",
      req.user.id
    );
    if (!shop) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ status: httpStatus.NOT_FOUND, message: "Not shop found." });
    }

    req.shop = shop;
    next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const credential = async (
  req: ExtendRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    let user: usersAttributes = null;
    if (req.user.id) {
      user = await authRepositories.findUserByAttributes("id", req.user.id);
    }
    const compareUserPassword = await comparePassword(
      req.body.oldPassword,
      user.password
    );
    if (!compareUserPassword) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json({ status: httpStatus.BAD_REQUEST, message: "Invalid password." });
    }

    const hashedPassword = await hashPassword(req.body.newPassword);
    user.password = hashedPassword;
    req.user = user;
    next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const isShopExist = async (req: any, res: Response, next: NextFunction) => {
  try {
    const shop = await productRepositories.findShopByAttributes(
      db.Shops,
      "userId",
      req.user.id
    );
    if (shop) {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: httpStatus.BAD_REQUEST,
        message: "Already have a shop.",
        data: { shop: shop },
      });
    }
    return next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const isSellerShopExist = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const shop = await productRepositories.findShopByAttributes(
      Shops,
      "userId",
      req.user.id
    );
    if (!shop) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ status: httpStatus.NOT_FOUND, message: "Shop not found" });
    }
    req.shop = shop;
    return next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const transformFilesToBody = (
  req: Request,
  res: Response,
  next: NextFunction
) => {

  if (req.file) {
    req.body.file = req.file.path;
  }

  if (req.files) {
    const files = req.files as Express.Multer.File[];
    req.body.images = files.map((file) => file.path);
  }
  if (!req.file && !req.files) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({
        status: httpStatus.BAD_REQUEST,
        message: "File(s) are required",
      });
  }

  next();
};

const verifyOtp = async (
  req: ExtendRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await authRepositories.findUserByAttributes(
      "id",
      req.params.id
    );
    if (!user) {
      return res.status(httpStatus.NOT_FOUND).json({
        status: httpStatus.NOT_FOUND,
        message: "User not found.",
      });
    }

    const sessionData = await authRepositories.findSessionByUserIdOtp(
      user.id,
      req.body.otp
    );

    if (!sessionData || !sessionData.otp) {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: httpStatus.BAD_REQUEST,
        message: "Invalid or expired code.",
      });
    }

    if (new Date() > sessionData.otpExpiration) {
      await authRepositories.destroySessionByAttribute(
        "userId",
        user.id,
        "otp",
        req.body.otp
      );
      return res.status(httpStatus.BAD_REQUEST).json({
        status: httpStatus.BAD_REQUEST,
        message: "OTP expired.",
      });
    }
    await authRepositories.destroySessionByAttribute(
      "userId",
      user.id,
      "otp",
      req.body.otp
    );
    req.user = user;
    next();
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const isUserVerified = async (req: any, res: Response, next: NextFunction) => {
  const user: usersAttributes = await authRepositories.findUserByAttributes(
    "email",
    req.body.email
  );
  if (!user)
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({
        status: httpStatus.BAD_REQUEST,
        message: "Invalid Email or Password",
      });
  if (user.isVerified === false)
    return res.status(httpStatus.UNAUTHORIZED).json({
      status: httpStatus.UNAUTHORIZED,
      message: "Your account is not verified yet",
    });

  req.user = user;
  return next();
};

const isUserEnabled = async (req: any, res: Response, next: NextFunction) => {
  try {
    if (req.user.role === "seller") {
      const sellerProfile = await userRepositories.findSellerRequestByUserId(req.user.id);
      
      if (!sellerProfile || sellerProfile.requestStatus === "Pending") {
        return res.status(httpStatus.UNAUTHORIZED).json({
          status: httpStatus.UNAUTHORIZED,
          message: "Your account is still under review",
        });
      }
      
      if (sellerProfile.requestStatus === "Rejected") {
        return res.status(httpStatus.UNAUTHORIZED).json({
          status: httpStatus.UNAUTHORIZED,
          message: "You are not qualified to be registered as a seller",
        });
      }
    }

    if (req.user.status !== "enabled") {
      return res.status(httpStatus.UNAUTHORIZED).json({
        status: httpStatus.UNAUTHORIZED,
        message: "Your account is disabled",
      });
    }

    return next();
  } catch (error) {
    console.error("Error in isUserEnabled middleware:", error);
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: "An error occurred while verifying your account",
    });
  }
};


const isGoogleEnabled = async (req: any, res: Response, next: NextFunction) => {
  if (req.user.isGoogleAccount)
    return res.status(httpStatus.UNAUTHORIZED).json({
      status: httpStatus.UNAUTHORIZED,
      message: "This is google account, please login with google",
    });
  return next();
};

const isCartExist = async (
  req: ExtendRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const cart = await cartRepositories.getCartsByUserId(req.user.id);
    if (!cart) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({
          status: httpStatus.NOT_FOUND,
          message: "No cart found. Please create a cart first.",
        });
    }
    req.carts = cart;
    return next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};
const isCartExist1 = async (
  req: ExtendRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const cart = await cartRepositories.getCartsByUserId1(req.user.id);
    if (!cart) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({
          status: httpStatus.NOT_FOUND,
          message: "No cart found. Please create a cart first.",
        });
    }
    req.carts = cart;
    return next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const isProductIdExist = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const product = await productRepositories.findProductById(
      req.body.productId || req.params.id
    );
    if (!product)
      return res.status(httpStatus.NOT_FOUND).json({
        status: httpStatus.NOT_FOUND,
        message: "No product with that ID.",
      });
    return next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const isCartIdExist = async (req: any, res: Response, next: NextFunction) => {
  const cartId = req.params.cartId || req.body.cartId;
  if (!cartId) {
    return res.status(httpStatus.BAD_REQUEST).json({
      status: httpStatus.BAD_REQUEST,
      message: "Cart ID is required.",
    });
  }
  const cart = await cartRepositories.getCartByUserIdAndCartId(
    req.user.id,
    cartId
  );
  if (!cart) {
    return res.status(httpStatus.NOT_FOUND).json({
      status: httpStatus.NOT_FOUND,
      message: "Cart not found. Please add items to your cart.",
    });
  }
  req.cart = cart;
  return next();
};

const isCartProductExist = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const product = await cartRepositories.getProductByCartIdAndProductId(
      req.cart.id,
      req.params.productId
    );
    if (!product)
      return res.status(httpStatus.NOT_FOUND).json({
        status: httpStatus.NOT_FOUND,
        message: "Product not found.",
      });
    req.product = product;
    return next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const isPaginated = (req: any, res: Response, next: NextFunction) => {
  const limit: number | undefined = req.query.limit
    ? Number(req.query.limit)
    : undefined;
  const page: number | undefined = req.query.page
    ? Number(req.query.page)
    : undefined;

  req.pagination = {
    limit,
    page,
    offset: limit && page ? (page - 1) * limit : undefined,
  };

  next();
};

const isSearchFiltered = (
  req: ExtendRequest,
  res: Response,
  next: NextFunction
) => {
  const name = req.query.name || undefined;
  const category = req.query.category || undefined;
  const description = req.query.description || undefined;
  const minPrice = req.query.minprice || undefined;
  const maxPrice = req.query.maxprice || undefined;

  const searchQuery: any = { where: {} };

  if ((minPrice && !maxPrice) || (!minPrice && maxPrice)) {
    return res.status(httpStatus.BAD_REQUEST).json({
      status: httpStatus.BAD_REQUEST,
      message: "Minimum and maximum price are required",
    });
  }

  if (Number(minPrice) > Number(maxPrice)) {
    return res.status(httpStatus.BAD_REQUEST).json({
      status: httpStatus.BAD_REQUEST,
      message: "Minimum Price must be less than Maximum price",
    });
  }

  const orConditions = [];

  if (name !== undefined)
    orConditions.push({ name: { [Op.iLike]: `%${name}%` } });
  if (category !== undefined) orConditions.push({ category });
  if (description !== undefined)
    orConditions.push({ description: { [Op.iLike]: `%${description}%` } });
  if (minPrice !== undefined && maxPrice !== undefined) {
    orConditions.push({
      price: {
        [Op.gte]: minPrice,
        [Op.lte]: maxPrice,
      },
    });
  }

  if (orConditions.length > 0) {
    searchQuery.where[Op.or] = orConditions;
  }
  searchQuery.where.status = "available";
  searchQuery.where.expiryDate = {
    [Op.gte]: currentDate,
  };

  req.searchQuery = searchQuery;
  return next();
};

const isProductExistById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const product = await productRepositories.findProductById(req.params.id);
    if (!product) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ status: httpStatus.NOT_FOUND, message: "No product found." });
    }
    next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const isWishListExist = async (
  req: ExtendRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const wishList = await productRepositories.getWishListByUserId(req.user.id);
    if (!wishList) {
      const newWishList = await productRepositories.createWishList({
        userId: req.user.id,
      });
      req.wishList = newWishList.id;
    } else {
      req.wishList = wishList.id;
    }
    next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const isWishListProductExist = async (
  req: ExtendRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const wishListProduct = await productRepositories.findProductfromWishList(
      req.params.id,
      req.wishList
    );
    if (wishListProduct) {
      return res.status(httpStatus.OK).json({
        message: "Product is added to wishlist successfully.",
        data: { wishListProduct },
      });
    }
    next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const isUserWishlistExist = async (
  req: ExtendRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const wishList = await productRepositories.findWishListByUserId(
      req.user.id
    );
    if (!wishList) {
      return res.status(httpStatus.NOT_FOUND).json({
        status: httpStatus.NOT_FOUND,
        message: "No wishlist Found",
      });
    }
    req.wishList = wishList;
    next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};
const isProductExistIntoWishList = async (
  req: ExtendRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const product = await productRepositories.findProductfromWishList(
      req.params.id,
      req.wishList.dataValues.id
    );
    if (!product) {
      return res.status(httpStatus.NOT_FOUND).json({
        status: httpStatus.NOT_FOUND,
        message: "Product Not Found From WishList",
      });
    }
    req.product = product;
    next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const isNotificationsExist = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user.id;
    let notifications: any;
    if (req.params.id) {
      notifications = await db.Notifications.findOne({
        where: { id: req.params.id, userId },
      });
      if (!notifications) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json({
            status: httpStatus.NOT_FOUND,
            message: "Notification not found",
          });
      }
    } else {
      notifications = await db.Notifications.findAll({ where: { userId } });
      if (!notifications.length) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json({
            status: httpStatus.NOT_FOUND,
            message: "Notifications not found",
          });
      }
    }
    (req as any).notifications = notifications;
    return next();
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      });
  }
};

const isProductOrdered = async (
  req: ExtendRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const cart = await cartRepositories.getCartsByProductId(
      req.params.id,
      req.user.id
    );
    if (!cart) {
      return res.status(httpStatus.NOT_FOUND).json({
        status: httpStatus.NOT_FOUND,
        message: "Product is not ordered",
      });
    }

    if (cart.status !== "completed") {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: httpStatus.BAD_REQUEST,
        message: "Order is not Completed",
      });
    }
    req.cart = cart;
    return next();
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      });
  }
};

const isUserProfileComplete = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user.id;
    const user = await userRepositories.findUserById(userId);

    const requiredFields = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "gender",
      "birthDate",
      "language",
      "currency",
    ];
    const isProfileComplete = requiredFields.every((field) => user[field]);

    if (!isProfileComplete) {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: httpStatus.BAD_REQUEST,
        message:
          "User profile is incomplete. Please fill out all required fields.",
      });
    }

    next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      error: error.message,
    });
  }
};
const isTermsTypeExist = async (req: Request, res: Response,next: NextFunction) =>{
  try {
    const {type} = req.body;
    const termsAndConditions = await userRepositories.findTermByType(type);
    if(termsAndConditions){
      return res.status(httpStatus.CONFLICT).json({
        status: httpStatus.CONFLICT,
        message: "Terms and Conditions with this type already exists, Please Update Terms and Conditions",
      });
    }
    next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
}

const isTermsAndConditionsExist = async(req: Request, res: Response, next: NextFunction)=>{
  try {
    const termsAndConditions = await userRepositories.getTermsAndConditionById(req.params.id);
    if (!termsAndConditions) {
      return res.status(httpStatus.NOT_FOUND).json({
        status: httpStatus.NOT_FOUND,
        message: "Terms and Conditions not found",
      });
    }
    next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
}
const isSellerRequestExist = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const role = req.user.role;
    let existingRequest = null;
    let user = null;

    switch (role) {
      case "admin":
        const requestCount = await db.SellerProfile.count();

        if (requestCount === 0) {
          return res.status(httpStatus.NOT_FOUND).json({
            status: httpStatus.NOT_FOUND,
            message: "No seller requests found",
          });
        }

        if (req.params.userId) {
          existingRequest = await userRepositories.findSellerRequestByUserId(req.params.userId);
          user = await userRepositories.findUserById(req.params.userId);

          if (!existingRequest) {
            return res.status(httpStatus.NOT_FOUND).json({
              status: httpStatus.NOT_FOUND,
              message: "No seller requests found for the provided user ID",
            });
          }

          req.user = user;
        }
        break;

      case "buyer":
        const userId = req.user.id || req.params.userId;
        existingRequest = await userRepositories.findSellerRequestByUserId(userId);

        if (existingRequest) {
          return res.status(httpStatus.BAD_REQUEST).json({
            status: httpStatus.BAD_REQUEST,
            message: "Seller request already submitted by this user",
          });
        }
        break;

      default:
        return res.status(httpStatus.BAD_REQUEST).json({
          status: httpStatus.BAD_REQUEST,
          message: "Invalid role or request",
        });
    }

    next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      error: error.message,
    });
  }
};


const isRequestAcceptedOrRejected = (req: any, res: Response, next: NextFunction) => {
  try {
    const { requestStatus } = req.body;

    if (requestStatus === "Accepted" || requestStatus === "Rejected") {
      req.requestStatus = requestStatus;
      return next();
    }
    return res.status(httpStatus.BAD_REQUEST).json({
      status: httpStatus.BAD_REQUEST,
      message:
        "Invalid request status. Only 'Accepted' or 'Rejected' are allowed.",
    });
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      error: error.message,
    });
  }
};

const isOrderExist = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let order: any;
    if (req.user.role === "buyer") {
      if (req.params.id) {
        order = await cartRepositories.getOrderByOrderIdAndUserId(
          req.params.id,
          req.user.id
        );
        if (!order) {
          return res.status(httpStatus.NOT_FOUND).json({
            status: httpStatus.NOT_FOUND,
            error: "order not found",
          });
        }
      } else {
        order = await cartRepositories.getOrdersByUserId(req.user.id);
        if (!order.orders || order.orders.length === 0) {
          return res.status(httpStatus.NOT_FOUND).json({
            status: httpStatus.NOT_FOUND,
            error: "orders not found",
          });
        }
      }
    }
    if (req.user.role === "admin") {
      order = await cartRepositories.getOrderById(req.params.id);
      if (!order) {
        return res.status(httpStatus.NOT_FOUND).json({
          status: httpStatus.NOT_FOUND,
          error: "order Not Found",
        });
      }
    }
    (req as any).order = order;
    return next();
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      error: error.message,
    });
  }
};

const isOrdersExist = async (req: any, res: Response, next: NextFunction) => {
  try {
    const order = await cartRepositories.getOrdersByCartId(req.user.id);
    if (!order) {
      return res.status(httpStatus.NOT_FOUND).json({
        status: httpStatus.NOT_FOUND,
        message: "No orders found",
      });
    }
    req.orders = order;
    next();
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      });
  }
};
const isOrderExists = async (req: any, res: Response, next: NextFunction) => {
  try {
    const order = await cartRepositories.getOrderByCartId(req.user.id);
    if (!order) {
      return res.status(httpStatus.NOT_FOUND).json({
        status: httpStatus.NOT_FOUND,
        message: "No orders found",
      });
    }
    req.order = order;
    next();
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      });
  }
};
const isOrderExists2 = async (req: any, res: Response, next: NextFunction) => {
  try {
    const order = await cartRepositories.getOrderByCartId2(
      req.user.id,
      req.params.id
    );
    if (!order) {
      return res.status(httpStatus.NOT_FOUND).json({
        status: httpStatus.NOT_FOUND,
        message: "No orders found",
      });
    }
    req.order = order;
    next();
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      });
  }
};
const isOrderEmpty = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const orders = await cartRepositories.getOrdersHistory();
  if (!orders) {
    return res.status(httpStatus.NOT_FOUND).json({
      status: httpStatus.NOT_FOUND,
      error: "order Not Found",
    });
  }
  (req as any).orders = orders;
  next();
};

const isShopEmpty = async (req: Request, res: Response, next: NextFunction) => {
  const shops = await userRepositories.getAllShops();
  if (!shops) {
    return res.status(httpStatus.NOT_FOUND).json({
      status: httpStatus.NOT_FOUND,
      error: "Shops Not Found",
    });
  }
  (req as any).shops = shops;
  next();
};

const isOrderExistByShopId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const shop = await productRepositories.findShopByUserId(req.user.id);
    if (shop) {
      const orders = await productRepositories.sellerGetOrdersHistory(shop.id);
      if (!orders) {
        return res.status(httpStatus.NOT_FOUND).json({
          status: httpStatus.NOT_FOUND,
          error: "Order Not Found",
        });
      }
      (req as any).ordersHistory = orders;
      next();
    } else {
      return res.status(httpStatus.NOT_FOUND).json({
        status: httpStatus.NOT_FOUND,
        error: "No shop found",
      });
    }
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      });
  }
};

export {
  validation,
  isUserExist,
  isAccountVerified,
  verifyUserCredentials,
  isUsersExist,
  isProductExist,
  isShopExist,
  transformFilesToBody,
  credential,
  isSessionExist,
  verifyUser,
  isGoogleEnabled,
  isUserEnabled,
  isUserVerified,
  isSellerShopExist,
  verifyOtp,
  isPaginated,
  isSearchFiltered,
  isCartIdExist,
  isProductIdExist,
  isCartExist,
  isCartExist1,
  isCartProductExist,
  isProductExistById,
  isWishListExist,
  isUserWishlistExist,
  isNotificationsExist,
  isWishListProductExist,
  isProductExistIntoWishList,
  isProductOrdered,
  isUserProfileComplete,
  isSellerRequestExist,
  isOrderExist,
  isOrderEmpty,
  isShopEmpty,
  isOrderExistByShopId,
  isOrdersExist,
  isOrderExists,
  isOrderExists2,
  isRequestAcceptedOrRejected,
  isTermsAndConditionsExist,
  isTermsTypeExist
};
