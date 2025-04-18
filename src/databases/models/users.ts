/* eslint-disable quotes */
/* eslint-disable comma-dangle */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable require-jsdoc */
import { Model, DataTypes, Optional } from "sequelize";
import sequelizeConnection from "../config/db.config";
import { hashPassword } from "../../helpers";
import Sessions from "./sessions";
import Shops from "./shops";
import Notifications from "./notifications";
import Addresses from "./addresses";
import SellerProfile from "./sellerProfile";
export interface usersAttributes {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  password: string;
  phone?: number;
  profilePicture?: string;
  gender?: string;
  birthDate?: string;
  language?: string;
  currency?: string;
  role?: string;
  isGoogleAccount?: boolean;
  isVerified?: boolean;
  is2FAEnabled?: boolean;
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
  passwordUpdatedAt?: Date;
}

export interface UsersCreationAttributes extends Optional<usersAttributes, "id"> {}
class Users extends Model<usersAttributes, UsersCreationAttributes> implements usersAttributes {
  declare id: string;
  declare firstName?: string;
  declare lastName?: string;
  declare email: string;
  declare phone?: number;
  declare profilePicture?: string;
  declare gender?: string;
  declare birthDate?: string;
  declare language?: string;
  declare currency?: string;
  declare role?: string;
  declare isVerified?: boolean;
  declare isGoogleAccount?: boolean;
  declare is2FAEnabled?: boolean;
  declare status?: string;
  declare password: string;
  declare createdAt?: Date;
  declare updatedAt?: Date;
  declare passwordUpdatedAt?: Date; 

  static associate() {
    Users.hasOne(Sessions, { foreignKey: "userId", as: "sessions",onDelete: "CASCADE" });
    Users.hasOne(Addresses, { foreignKey: "userId", as: "addresses",onDelete: "CASCADE" });
    Users.hasOne(Shops, { foreignKey: "userId", as: "shops",onDelete: "CASCADE" });
    Users.hasMany(Notifications, { foreignKey: "userId", as: "notifications",onDelete: "CASCADE" });
    Users.hasOne(SellerProfile, { foreignKey: "userId", as: "sellerProfile",onDelete: "CASCADE" });
  }
}

Users.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    firstName: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phone: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    profilePicture: {
      type: DataTypes.STRING(128),
      allowNull: true,
      defaultValue: "https://upload.wikimedia.org/wikipedia/commons/5/59/User-avatar.svg",
    },
    gender: {
      type: DataTypes.ENUM("male", "female"),
      allowNull: true,
    },
    birthDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    language: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    currency: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING(128),
      allowNull: true,
      defaultValue:"buyer"
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    isGoogleAccount: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    is2FAEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    status: {
      type: DataTypes.STRING(128),
      allowNull: true,
      defaultValue: "enabled",
    },
    passwordUpdatedAt: { 
      field: "passwordUpdatedAt",
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      field: "createdAt",
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      field: "updatedAt",
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize: sequelizeConnection,
    tableName: "users",
    timestamps: true,
    modelName: "Users",  
      hooks: {
        beforeCreate: async (user) => {
          if (user.password) {
            user.password = await hashPassword(user.password);
            user.passwordUpdatedAt = new Date(); 
          }
        },
        beforeUpdate: async (user) => {
          if (user.changed('password')) {
            user.password = await hashPassword(user.password);
            user.passwordUpdatedAt = new Date(); 
          }
        },
    },
  }
);

export default Users;