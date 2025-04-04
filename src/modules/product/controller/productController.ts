/* eslint-disable comma-dangle */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Response } from "express";
import httpStatus from "http-status";
import productRepositories from "../repositories/productRepositories";
import {uploadImages} from "../../../helpers/uploadImage";
import { ExtendRequest, IProductSold } from "../../../types";
import Products from "../../../databases/models/products";
import { eventEmitter } from "../../../helpers/notifications";

const sellerCreateProduct = async (req: ExtendRequest, res: Response) => {
  try {
    const uploadPromises = req.files.map((file) => uploadImages(file));
    const images = await Promise.all(uploadPromises);
    const productData = {
      ...req.body,
      shopId: req.shop.id,
      images: images.map((image) => image.secure_url),
    };
    const product = await productRepositories.createProduct(productData);
    res.status(httpStatus.CREATED).json({
      status: httpStatus.CREATED,
      message: "Product created successfully",
      data: { product },
    });
    eventEmitter.emit("productAdded", product);
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const sellerCreateShop = async (req: ExtendRequest, res: Response) => {
  try {
    const shopData = {
      userId: req.user.id,
      name: req.body.name,
      description: req.body.description,
    };
    const shop = await productRepositories.createShop(shopData);
    res.status(httpStatus.CREATED).json({
      status: httpStatus.CREATED,
      message: "Shop created successfully",
      data: { shop: shop },
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const sellerDeleteProduct = async (req: ExtendRequest, res: Response) => {
  try {
    const productId = req.params.id;
    eventEmitter.emit("productRemoved", { id: productId });
    await productRepositories.deleteProductById(productId);
    res.status(httpStatus.OK).json({ message: "Product deleted successfully" });
  } catch (error) {
    res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ status: httpStatus.INTERNAL_SERVER_ERROR, message: error.message });
  }
};

const sellerGetStatistics = async (
  req: ExtendRequest,
  res: Response
): Promise<void> => {
  try {
    const { startDate, endDate } = req.body;
    const shop = await productRepositories.findShopByUserId(req.user.id);
    const orders = await productRepositories.getOrdersPerTimeframe(
      shop.id,
      new Date(startDate),
      new Date(endDate)
    );

    let totalOrders = 0;
    let totalRevenue = 0;
    let totalProducts = 0;
    const productsSoldMap = new Map<number | string, IProductSold>();

    await Promise.all(
      orders.map(async (order) => {
        totalOrders += 1;
        const allCartProducts =
          await productRepositories.getOrderProductsByCartId(order.cartId);

        await Promise.all(
          allCartProducts.map(async (cartProduct) => {
            totalRevenue += cartProduct.totalPrice;
            const product = await productRepositories.findProductById(
              cartProduct.productId
            );
            if (productsSoldMap.has(cartProduct.productId)) {
              productsSoldMap.get(cartProduct.productId)!.quantity +=
                cartProduct.quantity;
            } else {
              totalProducts += 1;
              productsSoldMap.set(cartProduct.productId, {
                id: product.id,
                name: product.name,
                price: product.price,
                quantity: cartProduct.quantity,
              });
            }
          })
        );
      })
    );

    const productsSold = Array.from(productsSoldMap.values());

    const sortedProductSales = productsSold
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const data = {
      totalOrders,
      totalRevenue,
      totalProducts,
      bestSellingProducts: sortedProductSales,
    };

    res.status(httpStatus.OK).json({
      status: httpStatus.OK,
      message: `Seller's statistics from ${startDate} to ${endDate}`,
      data: { data }
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const updateProductStatus = async (req: ExtendRequest, res: Response) => {
  try {
    const data = await productRepositories.updateProductByAttributes(
      "status",
      req.body.status,
      "id",
      req.params.id
    );
    res
      .status(httpStatus.OK)
      .json({ status: httpStatus.OK, message: "Status updated successfully.", data: { data } });
    eventEmitter.emit("productStatusChanged", data)
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const sellerGetProducts = async (req: ExtendRequest, res: Response) => {
  try {
    const { limit, page, offset } = req.pagination;
    await productRepositories.markProducts(req.shop.id);
    const products = await productRepositories.sellerGetProducts(
      req.shop.id,
      limit,
      offset
    );
    const totalPages = Math.ceil(products.count / limit);
    const nextPage = page && page < totalPages ? page + 1 : undefined;
    const previousPage = page && page > 1 ? page - 1 : undefined;
    res.status(httpStatus.OK).json({
      status: httpStatus.OK,
      message: "All products fetched successfully.",
      data: {
        products: products.rows,
        previousPage,
        currentPage: page,
        nextPage,
        limit,
      },
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const sellerUpdateProduct = async (req: ExtendRequest, res: Response) => {
  try {
    const { id: productId } = req.params;
    const product = await productRepositories.getProductByIdAndShopId(
      productId,
      req.shop.id
    );

    const uploadPromises =
      req.files && req.files.map((file) => uploadImages(file));

    const images = uploadPromises && (await Promise.all(uploadPromises));

    const imagesArr = (images && images.length > 0)
      ? images.map((image) => image.secure_url)
      : product.images;

    const updatedProductData = {
      ...product,
      ...req.body,
      images: imagesArr,
    };

    const updatedProduct = await productRepositories.updateProduct(
      Products,
      updatedProductData,
      "id",
      productId
    );
    res.status(httpStatus.OK).json({
      status: httpStatus.OK,
      message: "Product updated successfully",
      data: { product: updatedProduct },
    });
    eventEmitter.emit("productUpdated", { id: productId, name: updatedProduct[1][0].name });
  } catch (error) {
    res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ status: httpStatus.INTERNAL_SERVER_ERROR, message: error.message });
  }
};

const userGetProducts = async (req: ExtendRequest, res: Response) => {
  try {
    const { limit, page, offset } = req.pagination;
    const products = await productRepositories.userGetProducts(limit, offset);
    const totalPages = Math.ceil(products.count / limit);
    const nextPage = page && page < totalPages ? page + 1 : undefined;
    const previousPage = page && page > 1 ? page - 1 : undefined;

    return res.status(httpStatus.OK).json({
      status: httpStatus.OK,
      message: "All products have been fetched successfully",
      data: {
        products: products.rows
        , nextPage,
        currentPage: page,
        previousPage,
        limit,
      },
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ status: httpStatus.INTERNAL_SERVER_ERROR, message: error.message });
  }
};

const userSearchProducts = async (req: ExtendRequest, res: Response) => {
  try {
    const { limit, page, offset } = req.pagination;
    const products = await productRepositories.userSearchProducts(
      req.searchQuery,
      limit,
      offset
    );
    const totalPages = Math.ceil(products.count / limit);
    const nextPage = page && page < totalPages ? page + 1 : undefined;
    const previousPage = page && page > 1 ? page - 1 : undefined;
    return res.status(httpStatus.OK).json({
      status: httpStatus.OK,
      message: "All products have been fetched successfully",
      data: {
        products: products.rows,
        nextPage,
        currentPage: page,
        previousPage,
        limit,
      }
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ status: httpStatus.INTERNAL_SERVER_ERROR, message: error.message });
  }
};

const userGetProduct = async (req: ExtendRequest, res: Response) => {
  try {
    const product = await productRepositories.findSingleProductById(req.params.id);
    res.status(httpStatus.OK).json({
      status: httpStatus.OK,
      message: "Products is fetched successfully.",
      data: {product},
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};
const sellerGetProduct = async (req: ExtendRequest, res: Response) => {
  try {
    const product = await productRepositories.sellerGetProductById(
      req.shop.id,
      req.params.id
    );
    res.status(httpStatus.OK).json({
      status: httpStatus.OK,
      message: "Product fetched successfully.",
      data: {product}
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const buyerAddProductToWishList = async (req: ExtendRequest, res: Response) => {
  try {
    const product = await productRepositories.addProductToWishList({ productId: req.params.id, wishListId: req.wishList });
    res.status(httpStatus.OK).json({
      status: httpStatus.OK,
      message: "Product is added to wishlist successfully.",
      data: { product }
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

const buyerDeleteWishListProducts = async (
  req: ExtendRequest,
  res: Response
) => {
  try {
    await productRepositories.deleteAllProductFromWishListById(req.wishList.dataValues.id);
    await productRepositories.removeWishList(req.wishList.dataValues.id);
    res.status(httpStatus.OK).json({ status: httpStatus.OK, message: "Your wishlist is cleared successfully." });

  } catch (error) {
    res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ status:httpStatus.INTERNAL_SERVER_ERROR, message: error.message });
  }
};
const buyerDeleteWishListProduct = async (
  req: ExtendRequest,
  res: Response
) => {
  try {
    await productRepositories.deleteProductFromWishList(
      req.params.id,
      req.wishList.dataValues.id
    );
    res
      .status(httpStatus.OK)
      .json({ status: httpStatus.OK, message: "The product removed from wishlist successfully." });
  } catch (error) {
    res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ status:httpStatus.INTERNAL_SERVER_ERROR, message: error.message });
  }
};
const buyerViewWishListProducts = async (req: ExtendRequest, res: Response) => {
  try {
    const products = req.wishList;
    res.status(httpStatus.OK).json({
      status:httpStatus.OK,
      message: "WishList is fetched successfully.",
      data: { WishList: products },
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message
    });
  }
};
const buyerViewWishListProduct = async (req: ExtendRequest, res: Response) => {
  try {
    const product = req.product;
    res.status(httpStatus.OK).json({
      status:httpStatus.OK,
      message: "WishList is fetched successfully.",
      data: { product }
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message
    });
  }
};

const buyerReviewProduct = async (req: ExtendRequest, res: Response) => {
  try {
    const data = {
      rating: req.body.rating,
      feedback: req.body.feedback,
      productId: req.params.id,
      userId: req.user.id
    }
    const productReview = await productRepositories.userCreateReview(data)
    return res.status(httpStatus.OK).json({
      status:httpStatus.OK,
      message: "Product reviewed successfully",
      data: { productReview }
    })
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
    
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message
    })
  }
}

const adminGetShops = async(req: ExtendRequest, res:Response)=>{
  const shops = (req as any).shops
  return res.status(httpStatus.OK).json({
    message: "List Of shops",
    data: { shops }
 })
}

const sellerGetOrdersHistory = async(req: ExtendRequest, res:Response)=>{
  const order = (req as any).ordersHistory;
  return res.status(httpStatus.OK).json({
    message: "Seller Order History",
    data: { order }
 })
}

const getProductsByShopId = async (req: ExtendRequest, res: Response) => {
  try {
    const products = await productRepositories.getProductsByShopId(req.params.id);
    
    if (products.length === 0) {
      return res.status(httpStatus.OK).json({
        status: httpStatus.OK,
        message: "No products found for this shop",
        data: { products: [] },
      });
    }

    res.status(httpStatus.OK).json({
      status: httpStatus.OK,
      message: "Products fetched successfully",
      data: { products },
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message,
    });
  }
};

export {
  sellerCreateProduct,
  sellerCreateShop,
  sellerUpdateProduct,
  sellerDeleteProduct,
  sellerGetStatistics,
  updateProductStatus,
  sellerGetProducts,
  userGetProducts,
  userSearchProducts,
  userGetProduct,
  sellerGetProduct,
  buyerAddProductToWishList,
  buyerReviewProduct,
  buyerDeleteWishListProducts,
  buyerViewWishListProduct,
  buyerViewWishListProducts,
  buyerDeleteWishListProduct,
  adminGetShops,
  sellerGetOrdersHistory,
  getProductsByShopId
};