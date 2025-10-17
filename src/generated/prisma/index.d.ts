
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model Agreement
 * 
 */
export type Agreement = $Result.DefaultSelection<Prisma.$AgreementPayload>
/**
 * Model Deposit
 * 
 */
export type Deposit = $Result.DefaultSelection<Prisma.$DepositPayload>
/**
 * Model IdempotencyKey
 * 
 */
export type IdempotencyKey = $Result.DefaultSelection<Prisma.$IdempotencyKeyPayload>
/**
 * Model Settlement
 * 
 */
export type Settlement = $Result.DefaultSelection<Prisma.$SettlementPayload>
/**
 * Model Receipt
 * 
 */
export type Receipt = $Result.DefaultSelection<Prisma.$ReceiptPayload>
/**
 * Model TransactionLog
 * 
 */
export type TransactionLog = $Result.DefaultSelection<Prisma.$TransactionLogPayload>
/**
 * Model Webhook
 * 
 */
export type Webhook = $Result.DefaultSelection<Prisma.$WebhookPayload>

/**
 * Enums
 */
export namespace $Enums {
  export const AgreementStatus: {
  PENDING: 'PENDING',
  FUNDED: 'FUNDED',
  USDC_LOCKED: 'USDC_LOCKED',
  NFT_LOCKED: 'NFT_LOCKED',
  BOTH_LOCKED: 'BOTH_LOCKED',
  SETTLED: 'SETTLED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED'
};

export type AgreementStatus = (typeof AgreementStatus)[keyof typeof AgreementStatus]


export const DepositType: {
  USDC: 'USDC',
  NFT: 'NFT'
};

export type DepositType = (typeof DepositType)[keyof typeof DepositType]


export const DepositStatus: {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED'
};

export type DepositStatus = (typeof DepositStatus)[keyof typeof DepositStatus]


export const WebhookEventType: {
  ESCROW_FUNDED: 'ESCROW_FUNDED',
  ESCROW_ASSET_LOCKED: 'ESCROW_ASSET_LOCKED',
  ESCROW_SETTLED: 'ESCROW_SETTLED',
  ESCROW_EXPIRED: 'ESCROW_EXPIRED',
  ESCROW_REFUNDED: 'ESCROW_REFUNDED'
};

export type WebhookEventType = (typeof WebhookEventType)[keyof typeof WebhookEventType]


export const WebhookDeliveryStatus: {
  PENDING: 'PENDING',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  RETRYING: 'RETRYING'
};

export type WebhookDeliveryStatus = (typeof WebhookDeliveryStatus)[keyof typeof WebhookDeliveryStatus]

}

export type AgreementStatus = $Enums.AgreementStatus

export const AgreementStatus: typeof $Enums.AgreementStatus

export type DepositType = $Enums.DepositType

export const DepositType: typeof $Enums.DepositType

export type DepositStatus = $Enums.DepositStatus

export const DepositStatus: typeof $Enums.DepositStatus

export type WebhookEventType = $Enums.WebhookEventType

export const WebhookEventType: typeof $Enums.WebhookEventType

export type WebhookDeliveryStatus = $Enums.WebhookDeliveryStatus

export const WebhookDeliveryStatus: typeof $Enums.WebhookDeliveryStatus

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Agreements
 * const agreements = await prisma.agreement.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Agreements
   * const agreements = await prisma.agreement.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.agreement`: Exposes CRUD operations for the **Agreement** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Agreements
    * const agreements = await prisma.agreement.findMany()
    * ```
    */
  get agreement(): Prisma.AgreementDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.deposit`: Exposes CRUD operations for the **Deposit** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Deposits
    * const deposits = await prisma.deposit.findMany()
    * ```
    */
  get deposit(): Prisma.DepositDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.idempotencyKey`: Exposes CRUD operations for the **IdempotencyKey** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more IdempotencyKeys
    * const idempotencyKeys = await prisma.idempotencyKey.findMany()
    * ```
    */
  get idempotencyKey(): Prisma.IdempotencyKeyDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.settlement`: Exposes CRUD operations for the **Settlement** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Settlements
    * const settlements = await prisma.settlement.findMany()
    * ```
    */
  get settlement(): Prisma.SettlementDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.receipt`: Exposes CRUD operations for the **Receipt** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Receipts
    * const receipts = await prisma.receipt.findMany()
    * ```
    */
  get receipt(): Prisma.ReceiptDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.transactionLog`: Exposes CRUD operations for the **TransactionLog** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more TransactionLogs
    * const transactionLogs = await prisma.transactionLog.findMany()
    * ```
    */
  get transactionLog(): Prisma.TransactionLogDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.webhook`: Exposes CRUD operations for the **Webhook** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Webhooks
    * const webhooks = await prisma.webhook.findMany()
    * ```
    */
  get webhook(): Prisma.WebhookDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.17.1
   * Query Engine version: 272a37d34178c2894197e17273bf937f25acdeac
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    Agreement: 'Agreement',
    Deposit: 'Deposit',
    IdempotencyKey: 'IdempotencyKey',
    Settlement: 'Settlement',
    Receipt: 'Receipt',
    TransactionLog: 'TransactionLog',
    Webhook: 'Webhook'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "agreement" | "deposit" | "idempotencyKey" | "settlement" | "receipt" | "transactionLog" | "webhook"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Agreement: {
        payload: Prisma.$AgreementPayload<ExtArgs>
        fields: Prisma.AgreementFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AgreementFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgreementPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AgreementFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgreementPayload>
          }
          findFirst: {
            args: Prisma.AgreementFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgreementPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AgreementFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgreementPayload>
          }
          findMany: {
            args: Prisma.AgreementFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgreementPayload>[]
          }
          create: {
            args: Prisma.AgreementCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgreementPayload>
          }
          createMany: {
            args: Prisma.AgreementCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.AgreementCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgreementPayload>[]
          }
          delete: {
            args: Prisma.AgreementDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgreementPayload>
          }
          update: {
            args: Prisma.AgreementUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgreementPayload>
          }
          deleteMany: {
            args: Prisma.AgreementDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AgreementUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.AgreementUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgreementPayload>[]
          }
          upsert: {
            args: Prisma.AgreementUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgreementPayload>
          }
          aggregate: {
            args: Prisma.AgreementAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAgreement>
          }
          groupBy: {
            args: Prisma.AgreementGroupByArgs<ExtArgs>
            result: $Utils.Optional<AgreementGroupByOutputType>[]
          }
          count: {
            args: Prisma.AgreementCountArgs<ExtArgs>
            result: $Utils.Optional<AgreementCountAggregateOutputType> | number
          }
        }
      }
      Deposit: {
        payload: Prisma.$DepositPayload<ExtArgs>
        fields: Prisma.DepositFieldRefs
        operations: {
          findUnique: {
            args: Prisma.DepositFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.DepositFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>
          }
          findFirst: {
            args: Prisma.DepositFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.DepositFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>
          }
          findMany: {
            args: Prisma.DepositFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>[]
          }
          create: {
            args: Prisma.DepositCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>
          }
          createMany: {
            args: Prisma.DepositCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.DepositCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>[]
          }
          delete: {
            args: Prisma.DepositDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>
          }
          update: {
            args: Prisma.DepositUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>
          }
          deleteMany: {
            args: Prisma.DepositDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.DepositUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.DepositUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>[]
          }
          upsert: {
            args: Prisma.DepositUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>
          }
          aggregate: {
            args: Prisma.DepositAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateDeposit>
          }
          groupBy: {
            args: Prisma.DepositGroupByArgs<ExtArgs>
            result: $Utils.Optional<DepositGroupByOutputType>[]
          }
          count: {
            args: Prisma.DepositCountArgs<ExtArgs>
            result: $Utils.Optional<DepositCountAggregateOutputType> | number
          }
        }
      }
      IdempotencyKey: {
        payload: Prisma.$IdempotencyKeyPayload<ExtArgs>
        fields: Prisma.IdempotencyKeyFieldRefs
        operations: {
          findUnique: {
            args: Prisma.IdempotencyKeyFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IdempotencyKeyPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.IdempotencyKeyFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IdempotencyKeyPayload>
          }
          findFirst: {
            args: Prisma.IdempotencyKeyFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IdempotencyKeyPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.IdempotencyKeyFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IdempotencyKeyPayload>
          }
          findMany: {
            args: Prisma.IdempotencyKeyFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IdempotencyKeyPayload>[]
          }
          create: {
            args: Prisma.IdempotencyKeyCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IdempotencyKeyPayload>
          }
          createMany: {
            args: Prisma.IdempotencyKeyCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.IdempotencyKeyCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IdempotencyKeyPayload>[]
          }
          delete: {
            args: Prisma.IdempotencyKeyDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IdempotencyKeyPayload>
          }
          update: {
            args: Prisma.IdempotencyKeyUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IdempotencyKeyPayload>
          }
          deleteMany: {
            args: Prisma.IdempotencyKeyDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.IdempotencyKeyUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.IdempotencyKeyUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IdempotencyKeyPayload>[]
          }
          upsert: {
            args: Prisma.IdempotencyKeyUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IdempotencyKeyPayload>
          }
          aggregate: {
            args: Prisma.IdempotencyKeyAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateIdempotencyKey>
          }
          groupBy: {
            args: Prisma.IdempotencyKeyGroupByArgs<ExtArgs>
            result: $Utils.Optional<IdempotencyKeyGroupByOutputType>[]
          }
          count: {
            args: Prisma.IdempotencyKeyCountArgs<ExtArgs>
            result: $Utils.Optional<IdempotencyKeyCountAggregateOutputType> | number
          }
        }
      }
      Settlement: {
        payload: Prisma.$SettlementPayload<ExtArgs>
        fields: Prisma.SettlementFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SettlementFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SettlementPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SettlementFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SettlementPayload>
          }
          findFirst: {
            args: Prisma.SettlementFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SettlementPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SettlementFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SettlementPayload>
          }
          findMany: {
            args: Prisma.SettlementFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SettlementPayload>[]
          }
          create: {
            args: Prisma.SettlementCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SettlementPayload>
          }
          createMany: {
            args: Prisma.SettlementCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SettlementCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SettlementPayload>[]
          }
          delete: {
            args: Prisma.SettlementDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SettlementPayload>
          }
          update: {
            args: Prisma.SettlementUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SettlementPayload>
          }
          deleteMany: {
            args: Prisma.SettlementDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SettlementUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SettlementUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SettlementPayload>[]
          }
          upsert: {
            args: Prisma.SettlementUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SettlementPayload>
          }
          aggregate: {
            args: Prisma.SettlementAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSettlement>
          }
          groupBy: {
            args: Prisma.SettlementGroupByArgs<ExtArgs>
            result: $Utils.Optional<SettlementGroupByOutputType>[]
          }
          count: {
            args: Prisma.SettlementCountArgs<ExtArgs>
            result: $Utils.Optional<SettlementCountAggregateOutputType> | number
          }
        }
      }
      Receipt: {
        payload: Prisma.$ReceiptPayload<ExtArgs>
        fields: Prisma.ReceiptFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ReceiptFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReceiptPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ReceiptFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReceiptPayload>
          }
          findFirst: {
            args: Prisma.ReceiptFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReceiptPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ReceiptFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReceiptPayload>
          }
          findMany: {
            args: Prisma.ReceiptFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReceiptPayload>[]
          }
          create: {
            args: Prisma.ReceiptCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReceiptPayload>
          }
          createMany: {
            args: Prisma.ReceiptCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ReceiptCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReceiptPayload>[]
          }
          delete: {
            args: Prisma.ReceiptDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReceiptPayload>
          }
          update: {
            args: Prisma.ReceiptUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReceiptPayload>
          }
          deleteMany: {
            args: Prisma.ReceiptDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ReceiptUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ReceiptUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReceiptPayload>[]
          }
          upsert: {
            args: Prisma.ReceiptUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReceiptPayload>
          }
          aggregate: {
            args: Prisma.ReceiptAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateReceipt>
          }
          groupBy: {
            args: Prisma.ReceiptGroupByArgs<ExtArgs>
            result: $Utils.Optional<ReceiptGroupByOutputType>[]
          }
          count: {
            args: Prisma.ReceiptCountArgs<ExtArgs>
            result: $Utils.Optional<ReceiptCountAggregateOutputType> | number
          }
        }
      }
      TransactionLog: {
        payload: Prisma.$TransactionLogPayload<ExtArgs>
        fields: Prisma.TransactionLogFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TransactionLogFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionLogPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TransactionLogFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionLogPayload>
          }
          findFirst: {
            args: Prisma.TransactionLogFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionLogPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TransactionLogFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionLogPayload>
          }
          findMany: {
            args: Prisma.TransactionLogFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionLogPayload>[]
          }
          create: {
            args: Prisma.TransactionLogCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionLogPayload>
          }
          createMany: {
            args: Prisma.TransactionLogCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TransactionLogCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionLogPayload>[]
          }
          delete: {
            args: Prisma.TransactionLogDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionLogPayload>
          }
          update: {
            args: Prisma.TransactionLogUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionLogPayload>
          }
          deleteMany: {
            args: Prisma.TransactionLogDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TransactionLogUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TransactionLogUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionLogPayload>[]
          }
          upsert: {
            args: Prisma.TransactionLogUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionLogPayload>
          }
          aggregate: {
            args: Prisma.TransactionLogAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTransactionLog>
          }
          groupBy: {
            args: Prisma.TransactionLogGroupByArgs<ExtArgs>
            result: $Utils.Optional<TransactionLogGroupByOutputType>[]
          }
          count: {
            args: Prisma.TransactionLogCountArgs<ExtArgs>
            result: $Utils.Optional<TransactionLogCountAggregateOutputType> | number
          }
        }
      }
      Webhook: {
        payload: Prisma.$WebhookPayload<ExtArgs>
        fields: Prisma.WebhookFieldRefs
        operations: {
          findUnique: {
            args: Prisma.WebhookFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WebhookPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.WebhookFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WebhookPayload>
          }
          findFirst: {
            args: Prisma.WebhookFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WebhookPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.WebhookFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WebhookPayload>
          }
          findMany: {
            args: Prisma.WebhookFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WebhookPayload>[]
          }
          create: {
            args: Prisma.WebhookCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WebhookPayload>
          }
          createMany: {
            args: Prisma.WebhookCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.WebhookCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WebhookPayload>[]
          }
          delete: {
            args: Prisma.WebhookDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WebhookPayload>
          }
          update: {
            args: Prisma.WebhookUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WebhookPayload>
          }
          deleteMany: {
            args: Prisma.WebhookDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.WebhookUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.WebhookUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WebhookPayload>[]
          }
          upsert: {
            args: Prisma.WebhookUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WebhookPayload>
          }
          aggregate: {
            args: Prisma.WebhookAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateWebhook>
          }
          groupBy: {
            args: Prisma.WebhookGroupByArgs<ExtArgs>
            result: $Utils.Optional<WebhookGroupByOutputType>[]
          }
          count: {
            args: Prisma.WebhookCountArgs<ExtArgs>
            result: $Utils.Optional<WebhookCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory | null
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    agreement?: AgreementOmit
    deposit?: DepositOmit
    idempotencyKey?: IdempotencyKeyOmit
    settlement?: SettlementOmit
    receipt?: ReceiptOmit
    transactionLog?: TransactionLogOmit
    webhook?: WebhookOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type AgreementCountOutputType
   */

  export type AgreementCountOutputType = {
    deposits: number
    webhooks: number
  }

  export type AgreementCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    deposits?: boolean | AgreementCountOutputTypeCountDepositsArgs
    webhooks?: boolean | AgreementCountOutputTypeCountWebhooksArgs
  }

  // Custom InputTypes
  /**
   * AgreementCountOutputType without action
   */
  export type AgreementCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgreementCountOutputType
     */
    select?: AgreementCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * AgreementCountOutputType without action
   */
  export type AgreementCountOutputTypeCountDepositsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DepositWhereInput
  }

  /**
   * AgreementCountOutputType without action
   */
  export type AgreementCountOutputTypeCountWebhooksArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WebhookWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Agreement
   */

  export type AggregateAgreement = {
    _count: AgreementCountAggregateOutputType | null
    _avg: AgreementAvgAggregateOutputType | null
    _sum: AgreementSumAggregateOutputType | null
    _min: AgreementMinAggregateOutputType | null
    _max: AgreementMaxAggregateOutputType | null
  }

  export type AgreementAvgAggregateOutputType = {
    price: Decimal | null
    feeBps: number | null
  }

  export type AgreementSumAggregateOutputType = {
    price: Decimal | null
    feeBps: number | null
  }

  export type AgreementMinAggregateOutputType = {
    id: string | null
    agreementId: string | null
    escrowPda: string | null
    nftMint: string | null
    seller: string | null
    buyer: string | null
    price: Decimal | null
    feeBps: number | null
    honorRoyalties: boolean | null
    status: $Enums.AgreementStatus | null
    expiry: Date | null
    usdcDepositAddr: string | null
    nftDepositAddr: string | null
    initTxId: string | null
    settleTxId: string | null
    cancelTxId: string | null
    createdAt: Date | null
    updatedAt: Date | null
    settledAt: Date | null
    cancelledAt: Date | null
  }

  export type AgreementMaxAggregateOutputType = {
    id: string | null
    agreementId: string | null
    escrowPda: string | null
    nftMint: string | null
    seller: string | null
    buyer: string | null
    price: Decimal | null
    feeBps: number | null
    honorRoyalties: boolean | null
    status: $Enums.AgreementStatus | null
    expiry: Date | null
    usdcDepositAddr: string | null
    nftDepositAddr: string | null
    initTxId: string | null
    settleTxId: string | null
    cancelTxId: string | null
    createdAt: Date | null
    updatedAt: Date | null
    settledAt: Date | null
    cancelledAt: Date | null
  }

  export type AgreementCountAggregateOutputType = {
    id: number
    agreementId: number
    escrowPda: number
    nftMint: number
    seller: number
    buyer: number
    price: number
    feeBps: number
    honorRoyalties: number
    status: number
    expiry: number
    usdcDepositAddr: number
    nftDepositAddr: number
    initTxId: number
    settleTxId: number
    cancelTxId: number
    createdAt: number
    updatedAt: number
    settledAt: number
    cancelledAt: number
    _all: number
  }


  export type AgreementAvgAggregateInputType = {
    price?: true
    feeBps?: true
  }

  export type AgreementSumAggregateInputType = {
    price?: true
    feeBps?: true
  }

  export type AgreementMinAggregateInputType = {
    id?: true
    agreementId?: true
    escrowPda?: true
    nftMint?: true
    seller?: true
    buyer?: true
    price?: true
    feeBps?: true
    honorRoyalties?: true
    status?: true
    expiry?: true
    usdcDepositAddr?: true
    nftDepositAddr?: true
    initTxId?: true
    settleTxId?: true
    cancelTxId?: true
    createdAt?: true
    updatedAt?: true
    settledAt?: true
    cancelledAt?: true
  }

  export type AgreementMaxAggregateInputType = {
    id?: true
    agreementId?: true
    escrowPda?: true
    nftMint?: true
    seller?: true
    buyer?: true
    price?: true
    feeBps?: true
    honorRoyalties?: true
    status?: true
    expiry?: true
    usdcDepositAddr?: true
    nftDepositAddr?: true
    initTxId?: true
    settleTxId?: true
    cancelTxId?: true
    createdAt?: true
    updatedAt?: true
    settledAt?: true
    cancelledAt?: true
  }

  export type AgreementCountAggregateInputType = {
    id?: true
    agreementId?: true
    escrowPda?: true
    nftMint?: true
    seller?: true
    buyer?: true
    price?: true
    feeBps?: true
    honorRoyalties?: true
    status?: true
    expiry?: true
    usdcDepositAddr?: true
    nftDepositAddr?: true
    initTxId?: true
    settleTxId?: true
    cancelTxId?: true
    createdAt?: true
    updatedAt?: true
    settledAt?: true
    cancelledAt?: true
    _all?: true
  }

  export type AgreementAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Agreement to aggregate.
     */
    where?: AgreementWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Agreements to fetch.
     */
    orderBy?: AgreementOrderByWithRelationInput | AgreementOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AgreementWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Agreements from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Agreements.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Agreements
    **/
    _count?: true | AgreementCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: AgreementAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: AgreementSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AgreementMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AgreementMaxAggregateInputType
  }

  export type GetAgreementAggregateType<T extends AgreementAggregateArgs> = {
        [P in keyof T & keyof AggregateAgreement]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAgreement[P]>
      : GetScalarType<T[P], AggregateAgreement[P]>
  }




  export type AgreementGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AgreementWhereInput
    orderBy?: AgreementOrderByWithAggregationInput | AgreementOrderByWithAggregationInput[]
    by: AgreementScalarFieldEnum[] | AgreementScalarFieldEnum
    having?: AgreementScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AgreementCountAggregateInputType | true
    _avg?: AgreementAvgAggregateInputType
    _sum?: AgreementSumAggregateInputType
    _min?: AgreementMinAggregateInputType
    _max?: AgreementMaxAggregateInputType
  }

  export type AgreementGroupByOutputType = {
    id: string
    agreementId: string
    escrowPda: string
    nftMint: string
    seller: string
    buyer: string | null
    price: Decimal
    feeBps: number
    honorRoyalties: boolean
    status: $Enums.AgreementStatus
    expiry: Date
    usdcDepositAddr: string | null
    nftDepositAddr: string | null
    initTxId: string | null
    settleTxId: string | null
    cancelTxId: string | null
    createdAt: Date
    updatedAt: Date
    settledAt: Date | null
    cancelledAt: Date | null
    _count: AgreementCountAggregateOutputType | null
    _avg: AgreementAvgAggregateOutputType | null
    _sum: AgreementSumAggregateOutputType | null
    _min: AgreementMinAggregateOutputType | null
    _max: AgreementMaxAggregateOutputType | null
  }

  type GetAgreementGroupByPayload<T extends AgreementGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AgreementGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AgreementGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AgreementGroupByOutputType[P]>
            : GetScalarType<T[P], AgreementGroupByOutputType[P]>
        }
      >
    >


  export type AgreementSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    escrowPda?: boolean
    nftMint?: boolean
    seller?: boolean
    buyer?: boolean
    price?: boolean
    feeBps?: boolean
    honorRoyalties?: boolean
    status?: boolean
    expiry?: boolean
    usdcDepositAddr?: boolean
    nftDepositAddr?: boolean
    initTxId?: boolean
    settleTxId?: boolean
    cancelTxId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    settledAt?: boolean
    cancelledAt?: boolean
    deposits?: boolean | Agreement$depositsArgs<ExtArgs>
    settlement?: boolean | Agreement$settlementArgs<ExtArgs>
    receipt?: boolean | Agreement$receiptArgs<ExtArgs>
    webhooks?: boolean | Agreement$webhooksArgs<ExtArgs>
    _count?: boolean | AgreementCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["agreement"]>

  export type AgreementSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    escrowPda?: boolean
    nftMint?: boolean
    seller?: boolean
    buyer?: boolean
    price?: boolean
    feeBps?: boolean
    honorRoyalties?: boolean
    status?: boolean
    expiry?: boolean
    usdcDepositAddr?: boolean
    nftDepositAddr?: boolean
    initTxId?: boolean
    settleTxId?: boolean
    cancelTxId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    settledAt?: boolean
    cancelledAt?: boolean
  }, ExtArgs["result"]["agreement"]>

  export type AgreementSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    escrowPda?: boolean
    nftMint?: boolean
    seller?: boolean
    buyer?: boolean
    price?: boolean
    feeBps?: boolean
    honorRoyalties?: boolean
    status?: boolean
    expiry?: boolean
    usdcDepositAddr?: boolean
    nftDepositAddr?: boolean
    initTxId?: boolean
    settleTxId?: boolean
    cancelTxId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    settledAt?: boolean
    cancelledAt?: boolean
  }, ExtArgs["result"]["agreement"]>

  export type AgreementSelectScalar = {
    id?: boolean
    agreementId?: boolean
    escrowPda?: boolean
    nftMint?: boolean
    seller?: boolean
    buyer?: boolean
    price?: boolean
    feeBps?: boolean
    honorRoyalties?: boolean
    status?: boolean
    expiry?: boolean
    usdcDepositAddr?: boolean
    nftDepositAddr?: boolean
    initTxId?: boolean
    settleTxId?: boolean
    cancelTxId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    settledAt?: boolean
    cancelledAt?: boolean
  }

  export type AgreementOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "agreementId" | "escrowPda" | "nftMint" | "seller" | "buyer" | "price" | "feeBps" | "honorRoyalties" | "status" | "expiry" | "usdcDepositAddr" | "nftDepositAddr" | "initTxId" | "settleTxId" | "cancelTxId" | "createdAt" | "updatedAt" | "settledAt" | "cancelledAt", ExtArgs["result"]["agreement"]>
  export type AgreementInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    deposits?: boolean | Agreement$depositsArgs<ExtArgs>
    settlement?: boolean | Agreement$settlementArgs<ExtArgs>
    receipt?: boolean | Agreement$receiptArgs<ExtArgs>
    webhooks?: boolean | Agreement$webhooksArgs<ExtArgs>
    _count?: boolean | AgreementCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type AgreementIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type AgreementIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $AgreementPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Agreement"
    objects: {
      deposits: Prisma.$DepositPayload<ExtArgs>[]
      settlement: Prisma.$SettlementPayload<ExtArgs> | null
      receipt: Prisma.$ReceiptPayload<ExtArgs> | null
      webhooks: Prisma.$WebhookPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      agreementId: string
      escrowPda: string
      nftMint: string
      seller: string
      buyer: string | null
      price: Prisma.Decimal
      feeBps: number
      honorRoyalties: boolean
      status: $Enums.AgreementStatus
      expiry: Date
      usdcDepositAddr: string | null
      nftDepositAddr: string | null
      initTxId: string | null
      settleTxId: string | null
      cancelTxId: string | null
      createdAt: Date
      updatedAt: Date
      settledAt: Date | null
      cancelledAt: Date | null
    }, ExtArgs["result"]["agreement"]>
    composites: {}
  }

  type AgreementGetPayload<S extends boolean | null | undefined | AgreementDefaultArgs> = $Result.GetResult<Prisma.$AgreementPayload, S>

  type AgreementCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<AgreementFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: AgreementCountAggregateInputType | true
    }

  export interface AgreementDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Agreement'], meta: { name: 'Agreement' } }
    /**
     * Find zero or one Agreement that matches the filter.
     * @param {AgreementFindUniqueArgs} args - Arguments to find a Agreement
     * @example
     * // Get one Agreement
     * const agreement = await prisma.agreement.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AgreementFindUniqueArgs>(args: SelectSubset<T, AgreementFindUniqueArgs<ExtArgs>>): Prisma__AgreementClient<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Agreement that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AgreementFindUniqueOrThrowArgs} args - Arguments to find a Agreement
     * @example
     * // Get one Agreement
     * const agreement = await prisma.agreement.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AgreementFindUniqueOrThrowArgs>(args: SelectSubset<T, AgreementFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AgreementClient<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Agreement that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgreementFindFirstArgs} args - Arguments to find a Agreement
     * @example
     * // Get one Agreement
     * const agreement = await prisma.agreement.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AgreementFindFirstArgs>(args?: SelectSubset<T, AgreementFindFirstArgs<ExtArgs>>): Prisma__AgreementClient<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Agreement that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgreementFindFirstOrThrowArgs} args - Arguments to find a Agreement
     * @example
     * // Get one Agreement
     * const agreement = await prisma.agreement.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AgreementFindFirstOrThrowArgs>(args?: SelectSubset<T, AgreementFindFirstOrThrowArgs<ExtArgs>>): Prisma__AgreementClient<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Agreements that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgreementFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Agreements
     * const agreements = await prisma.agreement.findMany()
     * 
     * // Get first 10 Agreements
     * const agreements = await prisma.agreement.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const agreementWithIdOnly = await prisma.agreement.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AgreementFindManyArgs>(args?: SelectSubset<T, AgreementFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Agreement.
     * @param {AgreementCreateArgs} args - Arguments to create a Agreement.
     * @example
     * // Create one Agreement
     * const Agreement = await prisma.agreement.create({
     *   data: {
     *     // ... data to create a Agreement
     *   }
     * })
     * 
     */
    create<T extends AgreementCreateArgs>(args: SelectSubset<T, AgreementCreateArgs<ExtArgs>>): Prisma__AgreementClient<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Agreements.
     * @param {AgreementCreateManyArgs} args - Arguments to create many Agreements.
     * @example
     * // Create many Agreements
     * const agreement = await prisma.agreement.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AgreementCreateManyArgs>(args?: SelectSubset<T, AgreementCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Agreements and returns the data saved in the database.
     * @param {AgreementCreateManyAndReturnArgs} args - Arguments to create many Agreements.
     * @example
     * // Create many Agreements
     * const agreement = await prisma.agreement.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Agreements and only return the `id`
     * const agreementWithIdOnly = await prisma.agreement.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends AgreementCreateManyAndReturnArgs>(args?: SelectSubset<T, AgreementCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Agreement.
     * @param {AgreementDeleteArgs} args - Arguments to delete one Agreement.
     * @example
     * // Delete one Agreement
     * const Agreement = await prisma.agreement.delete({
     *   where: {
     *     // ... filter to delete one Agreement
     *   }
     * })
     * 
     */
    delete<T extends AgreementDeleteArgs>(args: SelectSubset<T, AgreementDeleteArgs<ExtArgs>>): Prisma__AgreementClient<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Agreement.
     * @param {AgreementUpdateArgs} args - Arguments to update one Agreement.
     * @example
     * // Update one Agreement
     * const agreement = await prisma.agreement.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AgreementUpdateArgs>(args: SelectSubset<T, AgreementUpdateArgs<ExtArgs>>): Prisma__AgreementClient<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Agreements.
     * @param {AgreementDeleteManyArgs} args - Arguments to filter Agreements to delete.
     * @example
     * // Delete a few Agreements
     * const { count } = await prisma.agreement.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AgreementDeleteManyArgs>(args?: SelectSubset<T, AgreementDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Agreements.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgreementUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Agreements
     * const agreement = await prisma.agreement.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AgreementUpdateManyArgs>(args: SelectSubset<T, AgreementUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Agreements and returns the data updated in the database.
     * @param {AgreementUpdateManyAndReturnArgs} args - Arguments to update many Agreements.
     * @example
     * // Update many Agreements
     * const agreement = await prisma.agreement.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Agreements and only return the `id`
     * const agreementWithIdOnly = await prisma.agreement.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends AgreementUpdateManyAndReturnArgs>(args: SelectSubset<T, AgreementUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Agreement.
     * @param {AgreementUpsertArgs} args - Arguments to update or create a Agreement.
     * @example
     * // Update or create a Agreement
     * const agreement = await prisma.agreement.upsert({
     *   create: {
     *     // ... data to create a Agreement
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Agreement we want to update
     *   }
     * })
     */
    upsert<T extends AgreementUpsertArgs>(args: SelectSubset<T, AgreementUpsertArgs<ExtArgs>>): Prisma__AgreementClient<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Agreements.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgreementCountArgs} args - Arguments to filter Agreements to count.
     * @example
     * // Count the number of Agreements
     * const count = await prisma.agreement.count({
     *   where: {
     *     // ... the filter for the Agreements we want to count
     *   }
     * })
    **/
    count<T extends AgreementCountArgs>(
      args?: Subset<T, AgreementCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AgreementCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Agreement.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgreementAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AgreementAggregateArgs>(args: Subset<T, AgreementAggregateArgs>): Prisma.PrismaPromise<GetAgreementAggregateType<T>>

    /**
     * Group by Agreement.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgreementGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AgreementGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AgreementGroupByArgs['orderBy'] }
        : { orderBy?: AgreementGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AgreementGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAgreementGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Agreement model
   */
  readonly fields: AgreementFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Agreement.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AgreementClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    deposits<T extends Agreement$depositsArgs<ExtArgs> = {}>(args?: Subset<T, Agreement$depositsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    settlement<T extends Agreement$settlementArgs<ExtArgs> = {}>(args?: Subset<T, Agreement$settlementArgs<ExtArgs>>): Prisma__SettlementClient<$Result.GetResult<Prisma.$SettlementPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    receipt<T extends Agreement$receiptArgs<ExtArgs> = {}>(args?: Subset<T, Agreement$receiptArgs<ExtArgs>>): Prisma__ReceiptClient<$Result.GetResult<Prisma.$ReceiptPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    webhooks<T extends Agreement$webhooksArgs<ExtArgs> = {}>(args?: Subset<T, Agreement$webhooksArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WebhookPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Agreement model
   */
  interface AgreementFieldRefs {
    readonly id: FieldRef<"Agreement", 'String'>
    readonly agreementId: FieldRef<"Agreement", 'String'>
    readonly escrowPda: FieldRef<"Agreement", 'String'>
    readonly nftMint: FieldRef<"Agreement", 'String'>
    readonly seller: FieldRef<"Agreement", 'String'>
    readonly buyer: FieldRef<"Agreement", 'String'>
    readonly price: FieldRef<"Agreement", 'Decimal'>
    readonly feeBps: FieldRef<"Agreement", 'Int'>
    readonly honorRoyalties: FieldRef<"Agreement", 'Boolean'>
    readonly status: FieldRef<"Agreement", 'AgreementStatus'>
    readonly expiry: FieldRef<"Agreement", 'DateTime'>
    readonly usdcDepositAddr: FieldRef<"Agreement", 'String'>
    readonly nftDepositAddr: FieldRef<"Agreement", 'String'>
    readonly initTxId: FieldRef<"Agreement", 'String'>
    readonly settleTxId: FieldRef<"Agreement", 'String'>
    readonly cancelTxId: FieldRef<"Agreement", 'String'>
    readonly createdAt: FieldRef<"Agreement", 'DateTime'>
    readonly updatedAt: FieldRef<"Agreement", 'DateTime'>
    readonly settledAt: FieldRef<"Agreement", 'DateTime'>
    readonly cancelledAt: FieldRef<"Agreement", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Agreement findUnique
   */
  export type AgreementFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Agreement
     */
    select?: AgreementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Agreement
     */
    omit?: AgreementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgreementInclude<ExtArgs> | null
    /**
     * Filter, which Agreement to fetch.
     */
    where: AgreementWhereUniqueInput
  }

  /**
   * Agreement findUniqueOrThrow
   */
  export type AgreementFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Agreement
     */
    select?: AgreementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Agreement
     */
    omit?: AgreementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgreementInclude<ExtArgs> | null
    /**
     * Filter, which Agreement to fetch.
     */
    where: AgreementWhereUniqueInput
  }

  /**
   * Agreement findFirst
   */
  export type AgreementFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Agreement
     */
    select?: AgreementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Agreement
     */
    omit?: AgreementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgreementInclude<ExtArgs> | null
    /**
     * Filter, which Agreement to fetch.
     */
    where?: AgreementWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Agreements to fetch.
     */
    orderBy?: AgreementOrderByWithRelationInput | AgreementOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Agreements.
     */
    cursor?: AgreementWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Agreements from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Agreements.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Agreements.
     */
    distinct?: AgreementScalarFieldEnum | AgreementScalarFieldEnum[]
  }

  /**
   * Agreement findFirstOrThrow
   */
  export type AgreementFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Agreement
     */
    select?: AgreementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Agreement
     */
    omit?: AgreementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgreementInclude<ExtArgs> | null
    /**
     * Filter, which Agreement to fetch.
     */
    where?: AgreementWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Agreements to fetch.
     */
    orderBy?: AgreementOrderByWithRelationInput | AgreementOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Agreements.
     */
    cursor?: AgreementWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Agreements from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Agreements.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Agreements.
     */
    distinct?: AgreementScalarFieldEnum | AgreementScalarFieldEnum[]
  }

  /**
   * Agreement findMany
   */
  export type AgreementFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Agreement
     */
    select?: AgreementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Agreement
     */
    omit?: AgreementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgreementInclude<ExtArgs> | null
    /**
     * Filter, which Agreements to fetch.
     */
    where?: AgreementWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Agreements to fetch.
     */
    orderBy?: AgreementOrderByWithRelationInput | AgreementOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Agreements.
     */
    cursor?: AgreementWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Agreements from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Agreements.
     */
    skip?: number
    distinct?: AgreementScalarFieldEnum | AgreementScalarFieldEnum[]
  }

  /**
   * Agreement create
   */
  export type AgreementCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Agreement
     */
    select?: AgreementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Agreement
     */
    omit?: AgreementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgreementInclude<ExtArgs> | null
    /**
     * The data needed to create a Agreement.
     */
    data: XOR<AgreementCreateInput, AgreementUncheckedCreateInput>
  }

  /**
   * Agreement createMany
   */
  export type AgreementCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Agreements.
     */
    data: AgreementCreateManyInput | AgreementCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Agreement createManyAndReturn
   */
  export type AgreementCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Agreement
     */
    select?: AgreementSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Agreement
     */
    omit?: AgreementOmit<ExtArgs> | null
    /**
     * The data used to create many Agreements.
     */
    data: AgreementCreateManyInput | AgreementCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Agreement update
   */
  export type AgreementUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Agreement
     */
    select?: AgreementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Agreement
     */
    omit?: AgreementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgreementInclude<ExtArgs> | null
    /**
     * The data needed to update a Agreement.
     */
    data: XOR<AgreementUpdateInput, AgreementUncheckedUpdateInput>
    /**
     * Choose, which Agreement to update.
     */
    where: AgreementWhereUniqueInput
  }

  /**
   * Agreement updateMany
   */
  export type AgreementUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Agreements.
     */
    data: XOR<AgreementUpdateManyMutationInput, AgreementUncheckedUpdateManyInput>
    /**
     * Filter which Agreements to update
     */
    where?: AgreementWhereInput
    /**
     * Limit how many Agreements to update.
     */
    limit?: number
  }

  /**
   * Agreement updateManyAndReturn
   */
  export type AgreementUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Agreement
     */
    select?: AgreementSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Agreement
     */
    omit?: AgreementOmit<ExtArgs> | null
    /**
     * The data used to update Agreements.
     */
    data: XOR<AgreementUpdateManyMutationInput, AgreementUncheckedUpdateManyInput>
    /**
     * Filter which Agreements to update
     */
    where?: AgreementWhereInput
    /**
     * Limit how many Agreements to update.
     */
    limit?: number
  }

  /**
   * Agreement upsert
   */
  export type AgreementUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Agreement
     */
    select?: AgreementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Agreement
     */
    omit?: AgreementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgreementInclude<ExtArgs> | null
    /**
     * The filter to search for the Agreement to update in case it exists.
     */
    where: AgreementWhereUniqueInput
    /**
     * In case the Agreement found by the `where` argument doesn't exist, create a new Agreement with this data.
     */
    create: XOR<AgreementCreateInput, AgreementUncheckedCreateInput>
    /**
     * In case the Agreement was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AgreementUpdateInput, AgreementUncheckedUpdateInput>
  }

  /**
   * Agreement delete
   */
  export type AgreementDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Agreement
     */
    select?: AgreementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Agreement
     */
    omit?: AgreementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgreementInclude<ExtArgs> | null
    /**
     * Filter which Agreement to delete.
     */
    where: AgreementWhereUniqueInput
  }

  /**
   * Agreement deleteMany
   */
  export type AgreementDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Agreements to delete
     */
    where?: AgreementWhereInput
    /**
     * Limit how many Agreements to delete.
     */
    limit?: number
  }

  /**
   * Agreement.deposits
   */
  export type Agreement$depositsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    where?: DepositWhereInput
    orderBy?: DepositOrderByWithRelationInput | DepositOrderByWithRelationInput[]
    cursor?: DepositWhereUniqueInput
    take?: number
    skip?: number
    distinct?: DepositScalarFieldEnum | DepositScalarFieldEnum[]
  }

  /**
   * Agreement.settlement
   */
  export type Agreement$settlementArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Settlement
     */
    select?: SettlementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Settlement
     */
    omit?: SettlementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SettlementInclude<ExtArgs> | null
    where?: SettlementWhereInput
  }

  /**
   * Agreement.receipt
   */
  export type Agreement$receiptArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Receipt
     */
    select?: ReceiptSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Receipt
     */
    omit?: ReceiptOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReceiptInclude<ExtArgs> | null
    where?: ReceiptWhereInput
  }

  /**
   * Agreement.webhooks
   */
  export type Agreement$webhooksArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Webhook
     */
    select?: WebhookSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Webhook
     */
    omit?: WebhookOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WebhookInclude<ExtArgs> | null
    where?: WebhookWhereInput
    orderBy?: WebhookOrderByWithRelationInput | WebhookOrderByWithRelationInput[]
    cursor?: WebhookWhereUniqueInput
    take?: number
    skip?: number
    distinct?: WebhookScalarFieldEnum | WebhookScalarFieldEnum[]
  }

  /**
   * Agreement without action
   */
  export type AgreementDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Agreement
     */
    select?: AgreementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Agreement
     */
    omit?: AgreementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgreementInclude<ExtArgs> | null
  }


  /**
   * Model Deposit
   */

  export type AggregateDeposit = {
    _count: DepositCountAggregateOutputType | null
    _avg: DepositAvgAggregateOutputType | null
    _sum: DepositSumAggregateOutputType | null
    _min: DepositMinAggregateOutputType | null
    _max: DepositMaxAggregateOutputType | null
  }

  export type DepositAvgAggregateOutputType = {
    amount: Decimal | null
    blockHeight: number | null
  }

  export type DepositSumAggregateOutputType = {
    amount: Decimal | null
    blockHeight: bigint | null
  }

  export type DepositMinAggregateOutputType = {
    id: string | null
    agreementId: string | null
    type: $Enums.DepositType | null
    depositor: string | null
    amount: Decimal | null
    tokenAccount: string | null
    status: $Enums.DepositStatus | null
    txId: string | null
    blockHeight: bigint | null
    detectedAt: Date | null
    confirmedAt: Date | null
  }

  export type DepositMaxAggregateOutputType = {
    id: string | null
    agreementId: string | null
    type: $Enums.DepositType | null
    depositor: string | null
    amount: Decimal | null
    tokenAccount: string | null
    status: $Enums.DepositStatus | null
    txId: string | null
    blockHeight: bigint | null
    detectedAt: Date | null
    confirmedAt: Date | null
  }

  export type DepositCountAggregateOutputType = {
    id: number
    agreementId: number
    type: number
    depositor: number
    amount: number
    tokenAccount: number
    status: number
    txId: number
    blockHeight: number
    nftMetadata: number
    detectedAt: number
    confirmedAt: number
    _all: number
  }


  export type DepositAvgAggregateInputType = {
    amount?: true
    blockHeight?: true
  }

  export type DepositSumAggregateInputType = {
    amount?: true
    blockHeight?: true
  }

  export type DepositMinAggregateInputType = {
    id?: true
    agreementId?: true
    type?: true
    depositor?: true
    amount?: true
    tokenAccount?: true
    status?: true
    txId?: true
    blockHeight?: true
    detectedAt?: true
    confirmedAt?: true
  }

  export type DepositMaxAggregateInputType = {
    id?: true
    agreementId?: true
    type?: true
    depositor?: true
    amount?: true
    tokenAccount?: true
    status?: true
    txId?: true
    blockHeight?: true
    detectedAt?: true
    confirmedAt?: true
  }

  export type DepositCountAggregateInputType = {
    id?: true
    agreementId?: true
    type?: true
    depositor?: true
    amount?: true
    tokenAccount?: true
    status?: true
    txId?: true
    blockHeight?: true
    nftMetadata?: true
    detectedAt?: true
    confirmedAt?: true
    _all?: true
  }

  export type DepositAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Deposit to aggregate.
     */
    where?: DepositWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Deposits to fetch.
     */
    orderBy?: DepositOrderByWithRelationInput | DepositOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: DepositWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Deposits from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Deposits.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Deposits
    **/
    _count?: true | DepositCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: DepositAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: DepositSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: DepositMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: DepositMaxAggregateInputType
  }

  export type GetDepositAggregateType<T extends DepositAggregateArgs> = {
        [P in keyof T & keyof AggregateDeposit]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateDeposit[P]>
      : GetScalarType<T[P], AggregateDeposit[P]>
  }




  export type DepositGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DepositWhereInput
    orderBy?: DepositOrderByWithAggregationInput | DepositOrderByWithAggregationInput[]
    by: DepositScalarFieldEnum[] | DepositScalarFieldEnum
    having?: DepositScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: DepositCountAggregateInputType | true
    _avg?: DepositAvgAggregateInputType
    _sum?: DepositSumAggregateInputType
    _min?: DepositMinAggregateInputType
    _max?: DepositMaxAggregateInputType
  }

  export type DepositGroupByOutputType = {
    id: string
    agreementId: string
    type: $Enums.DepositType
    depositor: string
    amount: Decimal | null
    tokenAccount: string | null
    status: $Enums.DepositStatus
    txId: string | null
    blockHeight: bigint | null
    nftMetadata: JsonValue | null
    detectedAt: Date
    confirmedAt: Date | null
    _count: DepositCountAggregateOutputType | null
    _avg: DepositAvgAggregateOutputType | null
    _sum: DepositSumAggregateOutputType | null
    _min: DepositMinAggregateOutputType | null
    _max: DepositMaxAggregateOutputType | null
  }

  type GetDepositGroupByPayload<T extends DepositGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<DepositGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof DepositGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], DepositGroupByOutputType[P]>
            : GetScalarType<T[P], DepositGroupByOutputType[P]>
        }
      >
    >


  export type DepositSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    type?: boolean
    depositor?: boolean
    amount?: boolean
    tokenAccount?: boolean
    status?: boolean
    txId?: boolean
    blockHeight?: boolean
    nftMetadata?: boolean
    detectedAt?: boolean
    confirmedAt?: boolean
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["deposit"]>

  export type DepositSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    type?: boolean
    depositor?: boolean
    amount?: boolean
    tokenAccount?: boolean
    status?: boolean
    txId?: boolean
    blockHeight?: boolean
    nftMetadata?: boolean
    detectedAt?: boolean
    confirmedAt?: boolean
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["deposit"]>

  export type DepositSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    type?: boolean
    depositor?: boolean
    amount?: boolean
    tokenAccount?: boolean
    status?: boolean
    txId?: boolean
    blockHeight?: boolean
    nftMetadata?: boolean
    detectedAt?: boolean
    confirmedAt?: boolean
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["deposit"]>

  export type DepositSelectScalar = {
    id?: boolean
    agreementId?: boolean
    type?: boolean
    depositor?: boolean
    amount?: boolean
    tokenAccount?: boolean
    status?: boolean
    txId?: boolean
    blockHeight?: boolean
    nftMetadata?: boolean
    detectedAt?: boolean
    confirmedAt?: boolean
  }

  export type DepositOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "agreementId" | "type" | "depositor" | "amount" | "tokenAccount" | "status" | "txId" | "blockHeight" | "nftMetadata" | "detectedAt" | "confirmedAt", ExtArgs["result"]["deposit"]>
  export type DepositInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }
  export type DepositIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }
  export type DepositIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }

  export type $DepositPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Deposit"
    objects: {
      agreement: Prisma.$AgreementPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      agreementId: string
      type: $Enums.DepositType
      depositor: string
      amount: Prisma.Decimal | null
      tokenAccount: string | null
      status: $Enums.DepositStatus
      txId: string | null
      blockHeight: bigint | null
      nftMetadata: Prisma.JsonValue | null
      detectedAt: Date
      confirmedAt: Date | null
    }, ExtArgs["result"]["deposit"]>
    composites: {}
  }

  type DepositGetPayload<S extends boolean | null | undefined | DepositDefaultArgs> = $Result.GetResult<Prisma.$DepositPayload, S>

  type DepositCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<DepositFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: DepositCountAggregateInputType | true
    }

  export interface DepositDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Deposit'], meta: { name: 'Deposit' } }
    /**
     * Find zero or one Deposit that matches the filter.
     * @param {DepositFindUniqueArgs} args - Arguments to find a Deposit
     * @example
     * // Get one Deposit
     * const deposit = await prisma.deposit.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DepositFindUniqueArgs>(args: SelectSubset<T, DepositFindUniqueArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Deposit that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DepositFindUniqueOrThrowArgs} args - Arguments to find a Deposit
     * @example
     * // Get one Deposit
     * const deposit = await prisma.deposit.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DepositFindUniqueOrThrowArgs>(args: SelectSubset<T, DepositFindUniqueOrThrowArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Deposit that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositFindFirstArgs} args - Arguments to find a Deposit
     * @example
     * // Get one Deposit
     * const deposit = await prisma.deposit.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DepositFindFirstArgs>(args?: SelectSubset<T, DepositFindFirstArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Deposit that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositFindFirstOrThrowArgs} args - Arguments to find a Deposit
     * @example
     * // Get one Deposit
     * const deposit = await prisma.deposit.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DepositFindFirstOrThrowArgs>(args?: SelectSubset<T, DepositFindFirstOrThrowArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Deposits that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Deposits
     * const deposits = await prisma.deposit.findMany()
     * 
     * // Get first 10 Deposits
     * const deposits = await prisma.deposit.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const depositWithIdOnly = await prisma.deposit.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends DepositFindManyArgs>(args?: SelectSubset<T, DepositFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Deposit.
     * @param {DepositCreateArgs} args - Arguments to create a Deposit.
     * @example
     * // Create one Deposit
     * const Deposit = await prisma.deposit.create({
     *   data: {
     *     // ... data to create a Deposit
     *   }
     * })
     * 
     */
    create<T extends DepositCreateArgs>(args: SelectSubset<T, DepositCreateArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Deposits.
     * @param {DepositCreateManyArgs} args - Arguments to create many Deposits.
     * @example
     * // Create many Deposits
     * const deposit = await prisma.deposit.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends DepositCreateManyArgs>(args?: SelectSubset<T, DepositCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Deposits and returns the data saved in the database.
     * @param {DepositCreateManyAndReturnArgs} args - Arguments to create many Deposits.
     * @example
     * // Create many Deposits
     * const deposit = await prisma.deposit.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Deposits and only return the `id`
     * const depositWithIdOnly = await prisma.deposit.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends DepositCreateManyAndReturnArgs>(args?: SelectSubset<T, DepositCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Deposit.
     * @param {DepositDeleteArgs} args - Arguments to delete one Deposit.
     * @example
     * // Delete one Deposit
     * const Deposit = await prisma.deposit.delete({
     *   where: {
     *     // ... filter to delete one Deposit
     *   }
     * })
     * 
     */
    delete<T extends DepositDeleteArgs>(args: SelectSubset<T, DepositDeleteArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Deposit.
     * @param {DepositUpdateArgs} args - Arguments to update one Deposit.
     * @example
     * // Update one Deposit
     * const deposit = await prisma.deposit.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends DepositUpdateArgs>(args: SelectSubset<T, DepositUpdateArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Deposits.
     * @param {DepositDeleteManyArgs} args - Arguments to filter Deposits to delete.
     * @example
     * // Delete a few Deposits
     * const { count } = await prisma.deposit.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends DepositDeleteManyArgs>(args?: SelectSubset<T, DepositDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Deposits.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Deposits
     * const deposit = await prisma.deposit.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends DepositUpdateManyArgs>(args: SelectSubset<T, DepositUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Deposits and returns the data updated in the database.
     * @param {DepositUpdateManyAndReturnArgs} args - Arguments to update many Deposits.
     * @example
     * // Update many Deposits
     * const deposit = await prisma.deposit.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Deposits and only return the `id`
     * const depositWithIdOnly = await prisma.deposit.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends DepositUpdateManyAndReturnArgs>(args: SelectSubset<T, DepositUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Deposit.
     * @param {DepositUpsertArgs} args - Arguments to update or create a Deposit.
     * @example
     * // Update or create a Deposit
     * const deposit = await prisma.deposit.upsert({
     *   create: {
     *     // ... data to create a Deposit
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Deposit we want to update
     *   }
     * })
     */
    upsert<T extends DepositUpsertArgs>(args: SelectSubset<T, DepositUpsertArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Deposits.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositCountArgs} args - Arguments to filter Deposits to count.
     * @example
     * // Count the number of Deposits
     * const count = await prisma.deposit.count({
     *   where: {
     *     // ... the filter for the Deposits we want to count
     *   }
     * })
    **/
    count<T extends DepositCountArgs>(
      args?: Subset<T, DepositCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], DepositCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Deposit.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends DepositAggregateArgs>(args: Subset<T, DepositAggregateArgs>): Prisma.PrismaPromise<GetDepositAggregateType<T>>

    /**
     * Group by Deposit.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends DepositGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: DepositGroupByArgs['orderBy'] }
        : { orderBy?: DepositGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, DepositGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetDepositGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Deposit model
   */
  readonly fields: DepositFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Deposit.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__DepositClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    agreement<T extends AgreementDefaultArgs<ExtArgs> = {}>(args?: Subset<T, AgreementDefaultArgs<ExtArgs>>): Prisma__AgreementClient<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Deposit model
   */
  interface DepositFieldRefs {
    readonly id: FieldRef<"Deposit", 'String'>
    readonly agreementId: FieldRef<"Deposit", 'String'>
    readonly type: FieldRef<"Deposit", 'DepositType'>
    readonly depositor: FieldRef<"Deposit", 'String'>
    readonly amount: FieldRef<"Deposit", 'Decimal'>
    readonly tokenAccount: FieldRef<"Deposit", 'String'>
    readonly status: FieldRef<"Deposit", 'DepositStatus'>
    readonly txId: FieldRef<"Deposit", 'String'>
    readonly blockHeight: FieldRef<"Deposit", 'BigInt'>
    readonly nftMetadata: FieldRef<"Deposit", 'Json'>
    readonly detectedAt: FieldRef<"Deposit", 'DateTime'>
    readonly confirmedAt: FieldRef<"Deposit", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Deposit findUnique
   */
  export type DepositFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * Filter, which Deposit to fetch.
     */
    where: DepositWhereUniqueInput
  }

  /**
   * Deposit findUniqueOrThrow
   */
  export type DepositFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * Filter, which Deposit to fetch.
     */
    where: DepositWhereUniqueInput
  }

  /**
   * Deposit findFirst
   */
  export type DepositFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * Filter, which Deposit to fetch.
     */
    where?: DepositWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Deposits to fetch.
     */
    orderBy?: DepositOrderByWithRelationInput | DepositOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Deposits.
     */
    cursor?: DepositWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Deposits from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Deposits.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Deposits.
     */
    distinct?: DepositScalarFieldEnum | DepositScalarFieldEnum[]
  }

  /**
   * Deposit findFirstOrThrow
   */
  export type DepositFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * Filter, which Deposit to fetch.
     */
    where?: DepositWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Deposits to fetch.
     */
    orderBy?: DepositOrderByWithRelationInput | DepositOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Deposits.
     */
    cursor?: DepositWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Deposits from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Deposits.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Deposits.
     */
    distinct?: DepositScalarFieldEnum | DepositScalarFieldEnum[]
  }

  /**
   * Deposit findMany
   */
  export type DepositFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * Filter, which Deposits to fetch.
     */
    where?: DepositWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Deposits to fetch.
     */
    orderBy?: DepositOrderByWithRelationInput | DepositOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Deposits.
     */
    cursor?: DepositWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Deposits from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Deposits.
     */
    skip?: number
    distinct?: DepositScalarFieldEnum | DepositScalarFieldEnum[]
  }

  /**
   * Deposit create
   */
  export type DepositCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * The data needed to create a Deposit.
     */
    data: XOR<DepositCreateInput, DepositUncheckedCreateInput>
  }

  /**
   * Deposit createMany
   */
  export type DepositCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Deposits.
     */
    data: DepositCreateManyInput | DepositCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Deposit createManyAndReturn
   */
  export type DepositCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * The data used to create many Deposits.
     */
    data: DepositCreateManyInput | DepositCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Deposit update
   */
  export type DepositUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * The data needed to update a Deposit.
     */
    data: XOR<DepositUpdateInput, DepositUncheckedUpdateInput>
    /**
     * Choose, which Deposit to update.
     */
    where: DepositWhereUniqueInput
  }

  /**
   * Deposit updateMany
   */
  export type DepositUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Deposits.
     */
    data: XOR<DepositUpdateManyMutationInput, DepositUncheckedUpdateManyInput>
    /**
     * Filter which Deposits to update
     */
    where?: DepositWhereInput
    /**
     * Limit how many Deposits to update.
     */
    limit?: number
  }

  /**
   * Deposit updateManyAndReturn
   */
  export type DepositUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * The data used to update Deposits.
     */
    data: XOR<DepositUpdateManyMutationInput, DepositUncheckedUpdateManyInput>
    /**
     * Filter which Deposits to update
     */
    where?: DepositWhereInput
    /**
     * Limit how many Deposits to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Deposit upsert
   */
  export type DepositUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * The filter to search for the Deposit to update in case it exists.
     */
    where: DepositWhereUniqueInput
    /**
     * In case the Deposit found by the `where` argument doesn't exist, create a new Deposit with this data.
     */
    create: XOR<DepositCreateInput, DepositUncheckedCreateInput>
    /**
     * In case the Deposit was found with the provided `where` argument, update it with this data.
     */
    update: XOR<DepositUpdateInput, DepositUncheckedUpdateInput>
  }

  /**
   * Deposit delete
   */
  export type DepositDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * Filter which Deposit to delete.
     */
    where: DepositWhereUniqueInput
  }

  /**
   * Deposit deleteMany
   */
  export type DepositDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Deposits to delete
     */
    where?: DepositWhereInput
    /**
     * Limit how many Deposits to delete.
     */
    limit?: number
  }

  /**
   * Deposit without action
   */
  export type DepositDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
  }


  /**
   * Model IdempotencyKey
   */

  export type AggregateIdempotencyKey = {
    _count: IdempotencyKeyCountAggregateOutputType | null
    _avg: IdempotencyKeyAvgAggregateOutputType | null
    _sum: IdempotencyKeySumAggregateOutputType | null
    _min: IdempotencyKeyMinAggregateOutputType | null
    _max: IdempotencyKeyMaxAggregateOutputType | null
  }

  export type IdempotencyKeyAvgAggregateOutputType = {
    responseStatus: number | null
  }

  export type IdempotencyKeySumAggregateOutputType = {
    responseStatus: number | null
  }

  export type IdempotencyKeyMinAggregateOutputType = {
    id: string | null
    key: string | null
    endpoint: string | null
    requestHash: string | null
    responseStatus: number | null
    createdAt: Date | null
    expiresAt: Date | null
  }

  export type IdempotencyKeyMaxAggregateOutputType = {
    id: string | null
    key: string | null
    endpoint: string | null
    requestHash: string | null
    responseStatus: number | null
    createdAt: Date | null
    expiresAt: Date | null
  }

  export type IdempotencyKeyCountAggregateOutputType = {
    id: number
    key: number
    endpoint: number
    requestHash: number
    responseStatus: number
    responseBody: number
    createdAt: number
    expiresAt: number
    _all: number
  }


  export type IdempotencyKeyAvgAggregateInputType = {
    responseStatus?: true
  }

  export type IdempotencyKeySumAggregateInputType = {
    responseStatus?: true
  }

  export type IdempotencyKeyMinAggregateInputType = {
    id?: true
    key?: true
    endpoint?: true
    requestHash?: true
    responseStatus?: true
    createdAt?: true
    expiresAt?: true
  }

  export type IdempotencyKeyMaxAggregateInputType = {
    id?: true
    key?: true
    endpoint?: true
    requestHash?: true
    responseStatus?: true
    createdAt?: true
    expiresAt?: true
  }

  export type IdempotencyKeyCountAggregateInputType = {
    id?: true
    key?: true
    endpoint?: true
    requestHash?: true
    responseStatus?: true
    responseBody?: true
    createdAt?: true
    expiresAt?: true
    _all?: true
  }

  export type IdempotencyKeyAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which IdempotencyKey to aggregate.
     */
    where?: IdempotencyKeyWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of IdempotencyKeys to fetch.
     */
    orderBy?: IdempotencyKeyOrderByWithRelationInput | IdempotencyKeyOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: IdempotencyKeyWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` IdempotencyKeys from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` IdempotencyKeys.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned IdempotencyKeys
    **/
    _count?: true | IdempotencyKeyCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: IdempotencyKeyAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: IdempotencyKeySumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: IdempotencyKeyMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: IdempotencyKeyMaxAggregateInputType
  }

  export type GetIdempotencyKeyAggregateType<T extends IdempotencyKeyAggregateArgs> = {
        [P in keyof T & keyof AggregateIdempotencyKey]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateIdempotencyKey[P]>
      : GetScalarType<T[P], AggregateIdempotencyKey[P]>
  }




  export type IdempotencyKeyGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: IdempotencyKeyWhereInput
    orderBy?: IdempotencyKeyOrderByWithAggregationInput | IdempotencyKeyOrderByWithAggregationInput[]
    by: IdempotencyKeyScalarFieldEnum[] | IdempotencyKeyScalarFieldEnum
    having?: IdempotencyKeyScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: IdempotencyKeyCountAggregateInputType | true
    _avg?: IdempotencyKeyAvgAggregateInputType
    _sum?: IdempotencyKeySumAggregateInputType
    _min?: IdempotencyKeyMinAggregateInputType
    _max?: IdempotencyKeyMaxAggregateInputType
  }

  export type IdempotencyKeyGroupByOutputType = {
    id: string
    key: string
    endpoint: string
    requestHash: string
    responseStatus: number
    responseBody: JsonValue
    createdAt: Date
    expiresAt: Date
    _count: IdempotencyKeyCountAggregateOutputType | null
    _avg: IdempotencyKeyAvgAggregateOutputType | null
    _sum: IdempotencyKeySumAggregateOutputType | null
    _min: IdempotencyKeyMinAggregateOutputType | null
    _max: IdempotencyKeyMaxAggregateOutputType | null
  }

  type GetIdempotencyKeyGroupByPayload<T extends IdempotencyKeyGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<IdempotencyKeyGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof IdempotencyKeyGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], IdempotencyKeyGroupByOutputType[P]>
            : GetScalarType<T[P], IdempotencyKeyGroupByOutputType[P]>
        }
      >
    >


  export type IdempotencyKeySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    key?: boolean
    endpoint?: boolean
    requestHash?: boolean
    responseStatus?: boolean
    responseBody?: boolean
    createdAt?: boolean
    expiresAt?: boolean
  }, ExtArgs["result"]["idempotencyKey"]>

  export type IdempotencyKeySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    key?: boolean
    endpoint?: boolean
    requestHash?: boolean
    responseStatus?: boolean
    responseBody?: boolean
    createdAt?: boolean
    expiresAt?: boolean
  }, ExtArgs["result"]["idempotencyKey"]>

  export type IdempotencyKeySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    key?: boolean
    endpoint?: boolean
    requestHash?: boolean
    responseStatus?: boolean
    responseBody?: boolean
    createdAt?: boolean
    expiresAt?: boolean
  }, ExtArgs["result"]["idempotencyKey"]>

  export type IdempotencyKeySelectScalar = {
    id?: boolean
    key?: boolean
    endpoint?: boolean
    requestHash?: boolean
    responseStatus?: boolean
    responseBody?: boolean
    createdAt?: boolean
    expiresAt?: boolean
  }

  export type IdempotencyKeyOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "key" | "endpoint" | "requestHash" | "responseStatus" | "responseBody" | "createdAt" | "expiresAt", ExtArgs["result"]["idempotencyKey"]>

  export type $IdempotencyKeyPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "IdempotencyKey"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      key: string
      endpoint: string
      requestHash: string
      responseStatus: number
      responseBody: Prisma.JsonValue
      createdAt: Date
      expiresAt: Date
    }, ExtArgs["result"]["idempotencyKey"]>
    composites: {}
  }

  type IdempotencyKeyGetPayload<S extends boolean | null | undefined | IdempotencyKeyDefaultArgs> = $Result.GetResult<Prisma.$IdempotencyKeyPayload, S>

  type IdempotencyKeyCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<IdempotencyKeyFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: IdempotencyKeyCountAggregateInputType | true
    }

  export interface IdempotencyKeyDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['IdempotencyKey'], meta: { name: 'IdempotencyKey' } }
    /**
     * Find zero or one IdempotencyKey that matches the filter.
     * @param {IdempotencyKeyFindUniqueArgs} args - Arguments to find a IdempotencyKey
     * @example
     * // Get one IdempotencyKey
     * const idempotencyKey = await prisma.idempotencyKey.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends IdempotencyKeyFindUniqueArgs>(args: SelectSubset<T, IdempotencyKeyFindUniqueArgs<ExtArgs>>): Prisma__IdempotencyKeyClient<$Result.GetResult<Prisma.$IdempotencyKeyPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one IdempotencyKey that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {IdempotencyKeyFindUniqueOrThrowArgs} args - Arguments to find a IdempotencyKey
     * @example
     * // Get one IdempotencyKey
     * const idempotencyKey = await prisma.idempotencyKey.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends IdempotencyKeyFindUniqueOrThrowArgs>(args: SelectSubset<T, IdempotencyKeyFindUniqueOrThrowArgs<ExtArgs>>): Prisma__IdempotencyKeyClient<$Result.GetResult<Prisma.$IdempotencyKeyPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first IdempotencyKey that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IdempotencyKeyFindFirstArgs} args - Arguments to find a IdempotencyKey
     * @example
     * // Get one IdempotencyKey
     * const idempotencyKey = await prisma.idempotencyKey.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends IdempotencyKeyFindFirstArgs>(args?: SelectSubset<T, IdempotencyKeyFindFirstArgs<ExtArgs>>): Prisma__IdempotencyKeyClient<$Result.GetResult<Prisma.$IdempotencyKeyPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first IdempotencyKey that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IdempotencyKeyFindFirstOrThrowArgs} args - Arguments to find a IdempotencyKey
     * @example
     * // Get one IdempotencyKey
     * const idempotencyKey = await prisma.idempotencyKey.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends IdempotencyKeyFindFirstOrThrowArgs>(args?: SelectSubset<T, IdempotencyKeyFindFirstOrThrowArgs<ExtArgs>>): Prisma__IdempotencyKeyClient<$Result.GetResult<Prisma.$IdempotencyKeyPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more IdempotencyKeys that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IdempotencyKeyFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all IdempotencyKeys
     * const idempotencyKeys = await prisma.idempotencyKey.findMany()
     * 
     * // Get first 10 IdempotencyKeys
     * const idempotencyKeys = await prisma.idempotencyKey.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const idempotencyKeyWithIdOnly = await prisma.idempotencyKey.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends IdempotencyKeyFindManyArgs>(args?: SelectSubset<T, IdempotencyKeyFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$IdempotencyKeyPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a IdempotencyKey.
     * @param {IdempotencyKeyCreateArgs} args - Arguments to create a IdempotencyKey.
     * @example
     * // Create one IdempotencyKey
     * const IdempotencyKey = await prisma.idempotencyKey.create({
     *   data: {
     *     // ... data to create a IdempotencyKey
     *   }
     * })
     * 
     */
    create<T extends IdempotencyKeyCreateArgs>(args: SelectSubset<T, IdempotencyKeyCreateArgs<ExtArgs>>): Prisma__IdempotencyKeyClient<$Result.GetResult<Prisma.$IdempotencyKeyPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many IdempotencyKeys.
     * @param {IdempotencyKeyCreateManyArgs} args - Arguments to create many IdempotencyKeys.
     * @example
     * // Create many IdempotencyKeys
     * const idempotencyKey = await prisma.idempotencyKey.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends IdempotencyKeyCreateManyArgs>(args?: SelectSubset<T, IdempotencyKeyCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many IdempotencyKeys and returns the data saved in the database.
     * @param {IdempotencyKeyCreateManyAndReturnArgs} args - Arguments to create many IdempotencyKeys.
     * @example
     * // Create many IdempotencyKeys
     * const idempotencyKey = await prisma.idempotencyKey.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many IdempotencyKeys and only return the `id`
     * const idempotencyKeyWithIdOnly = await prisma.idempotencyKey.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends IdempotencyKeyCreateManyAndReturnArgs>(args?: SelectSubset<T, IdempotencyKeyCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$IdempotencyKeyPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a IdempotencyKey.
     * @param {IdempotencyKeyDeleteArgs} args - Arguments to delete one IdempotencyKey.
     * @example
     * // Delete one IdempotencyKey
     * const IdempotencyKey = await prisma.idempotencyKey.delete({
     *   where: {
     *     // ... filter to delete one IdempotencyKey
     *   }
     * })
     * 
     */
    delete<T extends IdempotencyKeyDeleteArgs>(args: SelectSubset<T, IdempotencyKeyDeleteArgs<ExtArgs>>): Prisma__IdempotencyKeyClient<$Result.GetResult<Prisma.$IdempotencyKeyPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one IdempotencyKey.
     * @param {IdempotencyKeyUpdateArgs} args - Arguments to update one IdempotencyKey.
     * @example
     * // Update one IdempotencyKey
     * const idempotencyKey = await prisma.idempotencyKey.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends IdempotencyKeyUpdateArgs>(args: SelectSubset<T, IdempotencyKeyUpdateArgs<ExtArgs>>): Prisma__IdempotencyKeyClient<$Result.GetResult<Prisma.$IdempotencyKeyPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more IdempotencyKeys.
     * @param {IdempotencyKeyDeleteManyArgs} args - Arguments to filter IdempotencyKeys to delete.
     * @example
     * // Delete a few IdempotencyKeys
     * const { count } = await prisma.idempotencyKey.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends IdempotencyKeyDeleteManyArgs>(args?: SelectSubset<T, IdempotencyKeyDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more IdempotencyKeys.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IdempotencyKeyUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many IdempotencyKeys
     * const idempotencyKey = await prisma.idempotencyKey.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends IdempotencyKeyUpdateManyArgs>(args: SelectSubset<T, IdempotencyKeyUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more IdempotencyKeys and returns the data updated in the database.
     * @param {IdempotencyKeyUpdateManyAndReturnArgs} args - Arguments to update many IdempotencyKeys.
     * @example
     * // Update many IdempotencyKeys
     * const idempotencyKey = await prisma.idempotencyKey.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more IdempotencyKeys and only return the `id`
     * const idempotencyKeyWithIdOnly = await prisma.idempotencyKey.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends IdempotencyKeyUpdateManyAndReturnArgs>(args: SelectSubset<T, IdempotencyKeyUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$IdempotencyKeyPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one IdempotencyKey.
     * @param {IdempotencyKeyUpsertArgs} args - Arguments to update or create a IdempotencyKey.
     * @example
     * // Update or create a IdempotencyKey
     * const idempotencyKey = await prisma.idempotencyKey.upsert({
     *   create: {
     *     // ... data to create a IdempotencyKey
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the IdempotencyKey we want to update
     *   }
     * })
     */
    upsert<T extends IdempotencyKeyUpsertArgs>(args: SelectSubset<T, IdempotencyKeyUpsertArgs<ExtArgs>>): Prisma__IdempotencyKeyClient<$Result.GetResult<Prisma.$IdempotencyKeyPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of IdempotencyKeys.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IdempotencyKeyCountArgs} args - Arguments to filter IdempotencyKeys to count.
     * @example
     * // Count the number of IdempotencyKeys
     * const count = await prisma.idempotencyKey.count({
     *   where: {
     *     // ... the filter for the IdempotencyKeys we want to count
     *   }
     * })
    **/
    count<T extends IdempotencyKeyCountArgs>(
      args?: Subset<T, IdempotencyKeyCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], IdempotencyKeyCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a IdempotencyKey.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IdempotencyKeyAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends IdempotencyKeyAggregateArgs>(args: Subset<T, IdempotencyKeyAggregateArgs>): Prisma.PrismaPromise<GetIdempotencyKeyAggregateType<T>>

    /**
     * Group by IdempotencyKey.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IdempotencyKeyGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends IdempotencyKeyGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: IdempotencyKeyGroupByArgs['orderBy'] }
        : { orderBy?: IdempotencyKeyGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, IdempotencyKeyGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetIdempotencyKeyGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the IdempotencyKey model
   */
  readonly fields: IdempotencyKeyFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for IdempotencyKey.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__IdempotencyKeyClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the IdempotencyKey model
   */
  interface IdempotencyKeyFieldRefs {
    readonly id: FieldRef<"IdempotencyKey", 'String'>
    readonly key: FieldRef<"IdempotencyKey", 'String'>
    readonly endpoint: FieldRef<"IdempotencyKey", 'String'>
    readonly requestHash: FieldRef<"IdempotencyKey", 'String'>
    readonly responseStatus: FieldRef<"IdempotencyKey", 'Int'>
    readonly responseBody: FieldRef<"IdempotencyKey", 'Json'>
    readonly createdAt: FieldRef<"IdempotencyKey", 'DateTime'>
    readonly expiresAt: FieldRef<"IdempotencyKey", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * IdempotencyKey findUnique
   */
  export type IdempotencyKeyFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IdempotencyKey
     */
    select?: IdempotencyKeySelect<ExtArgs> | null
    /**
     * Omit specific fields from the IdempotencyKey
     */
    omit?: IdempotencyKeyOmit<ExtArgs> | null
    /**
     * Filter, which IdempotencyKey to fetch.
     */
    where: IdempotencyKeyWhereUniqueInput
  }

  /**
   * IdempotencyKey findUniqueOrThrow
   */
  export type IdempotencyKeyFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IdempotencyKey
     */
    select?: IdempotencyKeySelect<ExtArgs> | null
    /**
     * Omit specific fields from the IdempotencyKey
     */
    omit?: IdempotencyKeyOmit<ExtArgs> | null
    /**
     * Filter, which IdempotencyKey to fetch.
     */
    where: IdempotencyKeyWhereUniqueInput
  }

  /**
   * IdempotencyKey findFirst
   */
  export type IdempotencyKeyFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IdempotencyKey
     */
    select?: IdempotencyKeySelect<ExtArgs> | null
    /**
     * Omit specific fields from the IdempotencyKey
     */
    omit?: IdempotencyKeyOmit<ExtArgs> | null
    /**
     * Filter, which IdempotencyKey to fetch.
     */
    where?: IdempotencyKeyWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of IdempotencyKeys to fetch.
     */
    orderBy?: IdempotencyKeyOrderByWithRelationInput | IdempotencyKeyOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for IdempotencyKeys.
     */
    cursor?: IdempotencyKeyWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` IdempotencyKeys from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` IdempotencyKeys.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of IdempotencyKeys.
     */
    distinct?: IdempotencyKeyScalarFieldEnum | IdempotencyKeyScalarFieldEnum[]
  }

  /**
   * IdempotencyKey findFirstOrThrow
   */
  export type IdempotencyKeyFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IdempotencyKey
     */
    select?: IdempotencyKeySelect<ExtArgs> | null
    /**
     * Omit specific fields from the IdempotencyKey
     */
    omit?: IdempotencyKeyOmit<ExtArgs> | null
    /**
     * Filter, which IdempotencyKey to fetch.
     */
    where?: IdempotencyKeyWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of IdempotencyKeys to fetch.
     */
    orderBy?: IdempotencyKeyOrderByWithRelationInput | IdempotencyKeyOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for IdempotencyKeys.
     */
    cursor?: IdempotencyKeyWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` IdempotencyKeys from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` IdempotencyKeys.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of IdempotencyKeys.
     */
    distinct?: IdempotencyKeyScalarFieldEnum | IdempotencyKeyScalarFieldEnum[]
  }

  /**
   * IdempotencyKey findMany
   */
  export type IdempotencyKeyFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IdempotencyKey
     */
    select?: IdempotencyKeySelect<ExtArgs> | null
    /**
     * Omit specific fields from the IdempotencyKey
     */
    omit?: IdempotencyKeyOmit<ExtArgs> | null
    /**
     * Filter, which IdempotencyKeys to fetch.
     */
    where?: IdempotencyKeyWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of IdempotencyKeys to fetch.
     */
    orderBy?: IdempotencyKeyOrderByWithRelationInput | IdempotencyKeyOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing IdempotencyKeys.
     */
    cursor?: IdempotencyKeyWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` IdempotencyKeys from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` IdempotencyKeys.
     */
    skip?: number
    distinct?: IdempotencyKeyScalarFieldEnum | IdempotencyKeyScalarFieldEnum[]
  }

  /**
   * IdempotencyKey create
   */
  export type IdempotencyKeyCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IdempotencyKey
     */
    select?: IdempotencyKeySelect<ExtArgs> | null
    /**
     * Omit specific fields from the IdempotencyKey
     */
    omit?: IdempotencyKeyOmit<ExtArgs> | null
    /**
     * The data needed to create a IdempotencyKey.
     */
    data: XOR<IdempotencyKeyCreateInput, IdempotencyKeyUncheckedCreateInput>
  }

  /**
   * IdempotencyKey createMany
   */
  export type IdempotencyKeyCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many IdempotencyKeys.
     */
    data: IdempotencyKeyCreateManyInput | IdempotencyKeyCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * IdempotencyKey createManyAndReturn
   */
  export type IdempotencyKeyCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IdempotencyKey
     */
    select?: IdempotencyKeySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the IdempotencyKey
     */
    omit?: IdempotencyKeyOmit<ExtArgs> | null
    /**
     * The data used to create many IdempotencyKeys.
     */
    data: IdempotencyKeyCreateManyInput | IdempotencyKeyCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * IdempotencyKey update
   */
  export type IdempotencyKeyUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IdempotencyKey
     */
    select?: IdempotencyKeySelect<ExtArgs> | null
    /**
     * Omit specific fields from the IdempotencyKey
     */
    omit?: IdempotencyKeyOmit<ExtArgs> | null
    /**
     * The data needed to update a IdempotencyKey.
     */
    data: XOR<IdempotencyKeyUpdateInput, IdempotencyKeyUncheckedUpdateInput>
    /**
     * Choose, which IdempotencyKey to update.
     */
    where: IdempotencyKeyWhereUniqueInput
  }

  /**
   * IdempotencyKey updateMany
   */
  export type IdempotencyKeyUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update IdempotencyKeys.
     */
    data: XOR<IdempotencyKeyUpdateManyMutationInput, IdempotencyKeyUncheckedUpdateManyInput>
    /**
     * Filter which IdempotencyKeys to update
     */
    where?: IdempotencyKeyWhereInput
    /**
     * Limit how many IdempotencyKeys to update.
     */
    limit?: number
  }

  /**
   * IdempotencyKey updateManyAndReturn
   */
  export type IdempotencyKeyUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IdempotencyKey
     */
    select?: IdempotencyKeySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the IdempotencyKey
     */
    omit?: IdempotencyKeyOmit<ExtArgs> | null
    /**
     * The data used to update IdempotencyKeys.
     */
    data: XOR<IdempotencyKeyUpdateManyMutationInput, IdempotencyKeyUncheckedUpdateManyInput>
    /**
     * Filter which IdempotencyKeys to update
     */
    where?: IdempotencyKeyWhereInput
    /**
     * Limit how many IdempotencyKeys to update.
     */
    limit?: number
  }

  /**
   * IdempotencyKey upsert
   */
  export type IdempotencyKeyUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IdempotencyKey
     */
    select?: IdempotencyKeySelect<ExtArgs> | null
    /**
     * Omit specific fields from the IdempotencyKey
     */
    omit?: IdempotencyKeyOmit<ExtArgs> | null
    /**
     * The filter to search for the IdempotencyKey to update in case it exists.
     */
    where: IdempotencyKeyWhereUniqueInput
    /**
     * In case the IdempotencyKey found by the `where` argument doesn't exist, create a new IdempotencyKey with this data.
     */
    create: XOR<IdempotencyKeyCreateInput, IdempotencyKeyUncheckedCreateInput>
    /**
     * In case the IdempotencyKey was found with the provided `where` argument, update it with this data.
     */
    update: XOR<IdempotencyKeyUpdateInput, IdempotencyKeyUncheckedUpdateInput>
  }

  /**
   * IdempotencyKey delete
   */
  export type IdempotencyKeyDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IdempotencyKey
     */
    select?: IdempotencyKeySelect<ExtArgs> | null
    /**
     * Omit specific fields from the IdempotencyKey
     */
    omit?: IdempotencyKeyOmit<ExtArgs> | null
    /**
     * Filter which IdempotencyKey to delete.
     */
    where: IdempotencyKeyWhereUniqueInput
  }

  /**
   * IdempotencyKey deleteMany
   */
  export type IdempotencyKeyDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which IdempotencyKeys to delete
     */
    where?: IdempotencyKeyWhereInput
    /**
     * Limit how many IdempotencyKeys to delete.
     */
    limit?: number
  }

  /**
   * IdempotencyKey without action
   */
  export type IdempotencyKeyDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IdempotencyKey
     */
    select?: IdempotencyKeySelect<ExtArgs> | null
    /**
     * Omit specific fields from the IdempotencyKey
     */
    omit?: IdempotencyKeyOmit<ExtArgs> | null
  }


  /**
   * Model Settlement
   */

  export type AggregateSettlement = {
    _count: SettlementCountAggregateOutputType | null
    _avg: SettlementAvgAggregateOutputType | null
    _sum: SettlementSumAggregateOutputType | null
    _min: SettlementMinAggregateOutputType | null
    _max: SettlementMaxAggregateOutputType | null
  }

  export type SettlementAvgAggregateOutputType = {
    price: Decimal | null
    platformFee: Decimal | null
    creatorRoyalty: Decimal | null
    sellerReceived: Decimal | null
    blockHeight: number | null
  }

  export type SettlementSumAggregateOutputType = {
    price: Decimal | null
    platformFee: Decimal | null
    creatorRoyalty: Decimal | null
    sellerReceived: Decimal | null
    blockHeight: bigint | null
  }

  export type SettlementMinAggregateOutputType = {
    id: string | null
    agreementId: string | null
    nftMint: string | null
    price: Decimal | null
    platformFee: Decimal | null
    creatorRoyalty: Decimal | null
    sellerReceived: Decimal | null
    settleTxId: string | null
    blockHeight: bigint | null
    buyer: string | null
    seller: string | null
    feeCollector: string | null
    royaltyRecipient: string | null
    settledAt: Date | null
  }

  export type SettlementMaxAggregateOutputType = {
    id: string | null
    agreementId: string | null
    nftMint: string | null
    price: Decimal | null
    platformFee: Decimal | null
    creatorRoyalty: Decimal | null
    sellerReceived: Decimal | null
    settleTxId: string | null
    blockHeight: bigint | null
    buyer: string | null
    seller: string | null
    feeCollector: string | null
    royaltyRecipient: string | null
    settledAt: Date | null
  }

  export type SettlementCountAggregateOutputType = {
    id: number
    agreementId: number
    nftMint: number
    price: number
    platformFee: number
    creatorRoyalty: number
    sellerReceived: number
    settleTxId: number
    blockHeight: number
    buyer: number
    seller: number
    feeCollector: number
    royaltyRecipient: number
    settledAt: number
    _all: number
  }


  export type SettlementAvgAggregateInputType = {
    price?: true
    platformFee?: true
    creatorRoyalty?: true
    sellerReceived?: true
    blockHeight?: true
  }

  export type SettlementSumAggregateInputType = {
    price?: true
    platformFee?: true
    creatorRoyalty?: true
    sellerReceived?: true
    blockHeight?: true
  }

  export type SettlementMinAggregateInputType = {
    id?: true
    agreementId?: true
    nftMint?: true
    price?: true
    platformFee?: true
    creatorRoyalty?: true
    sellerReceived?: true
    settleTxId?: true
    blockHeight?: true
    buyer?: true
    seller?: true
    feeCollector?: true
    royaltyRecipient?: true
    settledAt?: true
  }

  export type SettlementMaxAggregateInputType = {
    id?: true
    agreementId?: true
    nftMint?: true
    price?: true
    platformFee?: true
    creatorRoyalty?: true
    sellerReceived?: true
    settleTxId?: true
    blockHeight?: true
    buyer?: true
    seller?: true
    feeCollector?: true
    royaltyRecipient?: true
    settledAt?: true
  }

  export type SettlementCountAggregateInputType = {
    id?: true
    agreementId?: true
    nftMint?: true
    price?: true
    platformFee?: true
    creatorRoyalty?: true
    sellerReceived?: true
    settleTxId?: true
    blockHeight?: true
    buyer?: true
    seller?: true
    feeCollector?: true
    royaltyRecipient?: true
    settledAt?: true
    _all?: true
  }

  export type SettlementAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Settlement to aggregate.
     */
    where?: SettlementWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Settlements to fetch.
     */
    orderBy?: SettlementOrderByWithRelationInput | SettlementOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SettlementWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Settlements from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Settlements.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Settlements
    **/
    _count?: true | SettlementCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SettlementAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SettlementSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SettlementMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SettlementMaxAggregateInputType
  }

  export type GetSettlementAggregateType<T extends SettlementAggregateArgs> = {
        [P in keyof T & keyof AggregateSettlement]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSettlement[P]>
      : GetScalarType<T[P], AggregateSettlement[P]>
  }




  export type SettlementGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SettlementWhereInput
    orderBy?: SettlementOrderByWithAggregationInput | SettlementOrderByWithAggregationInput[]
    by: SettlementScalarFieldEnum[] | SettlementScalarFieldEnum
    having?: SettlementScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SettlementCountAggregateInputType | true
    _avg?: SettlementAvgAggregateInputType
    _sum?: SettlementSumAggregateInputType
    _min?: SettlementMinAggregateInputType
    _max?: SettlementMaxAggregateInputType
  }

  export type SettlementGroupByOutputType = {
    id: string
    agreementId: string
    nftMint: string
    price: Decimal
    platformFee: Decimal
    creatorRoyalty: Decimal | null
    sellerReceived: Decimal
    settleTxId: string
    blockHeight: bigint
    buyer: string
    seller: string
    feeCollector: string | null
    royaltyRecipient: string | null
    settledAt: Date
    _count: SettlementCountAggregateOutputType | null
    _avg: SettlementAvgAggregateOutputType | null
    _sum: SettlementSumAggregateOutputType | null
    _min: SettlementMinAggregateOutputType | null
    _max: SettlementMaxAggregateOutputType | null
  }

  type GetSettlementGroupByPayload<T extends SettlementGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SettlementGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SettlementGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SettlementGroupByOutputType[P]>
            : GetScalarType<T[P], SettlementGroupByOutputType[P]>
        }
      >
    >


  export type SettlementSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    nftMint?: boolean
    price?: boolean
    platformFee?: boolean
    creatorRoyalty?: boolean
    sellerReceived?: boolean
    settleTxId?: boolean
    blockHeight?: boolean
    buyer?: boolean
    seller?: boolean
    feeCollector?: boolean
    royaltyRecipient?: boolean
    settledAt?: boolean
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["settlement"]>

  export type SettlementSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    nftMint?: boolean
    price?: boolean
    platformFee?: boolean
    creatorRoyalty?: boolean
    sellerReceived?: boolean
    settleTxId?: boolean
    blockHeight?: boolean
    buyer?: boolean
    seller?: boolean
    feeCollector?: boolean
    royaltyRecipient?: boolean
    settledAt?: boolean
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["settlement"]>

  export type SettlementSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    nftMint?: boolean
    price?: boolean
    platformFee?: boolean
    creatorRoyalty?: boolean
    sellerReceived?: boolean
    settleTxId?: boolean
    blockHeight?: boolean
    buyer?: boolean
    seller?: boolean
    feeCollector?: boolean
    royaltyRecipient?: boolean
    settledAt?: boolean
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["settlement"]>

  export type SettlementSelectScalar = {
    id?: boolean
    agreementId?: boolean
    nftMint?: boolean
    price?: boolean
    platformFee?: boolean
    creatorRoyalty?: boolean
    sellerReceived?: boolean
    settleTxId?: boolean
    blockHeight?: boolean
    buyer?: boolean
    seller?: boolean
    feeCollector?: boolean
    royaltyRecipient?: boolean
    settledAt?: boolean
  }

  export type SettlementOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "agreementId" | "nftMint" | "price" | "platformFee" | "creatorRoyalty" | "sellerReceived" | "settleTxId" | "blockHeight" | "buyer" | "seller" | "feeCollector" | "royaltyRecipient" | "settledAt", ExtArgs["result"]["settlement"]>
  export type SettlementInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }
  export type SettlementIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }
  export type SettlementIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }

  export type $SettlementPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Settlement"
    objects: {
      agreement: Prisma.$AgreementPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      agreementId: string
      nftMint: string
      price: Prisma.Decimal
      platformFee: Prisma.Decimal
      creatorRoyalty: Prisma.Decimal | null
      sellerReceived: Prisma.Decimal
      settleTxId: string
      blockHeight: bigint
      buyer: string
      seller: string
      feeCollector: string | null
      royaltyRecipient: string | null
      settledAt: Date
    }, ExtArgs["result"]["settlement"]>
    composites: {}
  }

  type SettlementGetPayload<S extends boolean | null | undefined | SettlementDefaultArgs> = $Result.GetResult<Prisma.$SettlementPayload, S>

  type SettlementCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SettlementFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SettlementCountAggregateInputType | true
    }

  export interface SettlementDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Settlement'], meta: { name: 'Settlement' } }
    /**
     * Find zero or one Settlement that matches the filter.
     * @param {SettlementFindUniqueArgs} args - Arguments to find a Settlement
     * @example
     * // Get one Settlement
     * const settlement = await prisma.settlement.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SettlementFindUniqueArgs>(args: SelectSubset<T, SettlementFindUniqueArgs<ExtArgs>>): Prisma__SettlementClient<$Result.GetResult<Prisma.$SettlementPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Settlement that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SettlementFindUniqueOrThrowArgs} args - Arguments to find a Settlement
     * @example
     * // Get one Settlement
     * const settlement = await prisma.settlement.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SettlementFindUniqueOrThrowArgs>(args: SelectSubset<T, SettlementFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SettlementClient<$Result.GetResult<Prisma.$SettlementPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Settlement that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SettlementFindFirstArgs} args - Arguments to find a Settlement
     * @example
     * // Get one Settlement
     * const settlement = await prisma.settlement.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SettlementFindFirstArgs>(args?: SelectSubset<T, SettlementFindFirstArgs<ExtArgs>>): Prisma__SettlementClient<$Result.GetResult<Prisma.$SettlementPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Settlement that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SettlementFindFirstOrThrowArgs} args - Arguments to find a Settlement
     * @example
     * // Get one Settlement
     * const settlement = await prisma.settlement.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SettlementFindFirstOrThrowArgs>(args?: SelectSubset<T, SettlementFindFirstOrThrowArgs<ExtArgs>>): Prisma__SettlementClient<$Result.GetResult<Prisma.$SettlementPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Settlements that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SettlementFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Settlements
     * const settlements = await prisma.settlement.findMany()
     * 
     * // Get first 10 Settlements
     * const settlements = await prisma.settlement.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const settlementWithIdOnly = await prisma.settlement.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SettlementFindManyArgs>(args?: SelectSubset<T, SettlementFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SettlementPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Settlement.
     * @param {SettlementCreateArgs} args - Arguments to create a Settlement.
     * @example
     * // Create one Settlement
     * const Settlement = await prisma.settlement.create({
     *   data: {
     *     // ... data to create a Settlement
     *   }
     * })
     * 
     */
    create<T extends SettlementCreateArgs>(args: SelectSubset<T, SettlementCreateArgs<ExtArgs>>): Prisma__SettlementClient<$Result.GetResult<Prisma.$SettlementPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Settlements.
     * @param {SettlementCreateManyArgs} args - Arguments to create many Settlements.
     * @example
     * // Create many Settlements
     * const settlement = await prisma.settlement.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SettlementCreateManyArgs>(args?: SelectSubset<T, SettlementCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Settlements and returns the data saved in the database.
     * @param {SettlementCreateManyAndReturnArgs} args - Arguments to create many Settlements.
     * @example
     * // Create many Settlements
     * const settlement = await prisma.settlement.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Settlements and only return the `id`
     * const settlementWithIdOnly = await prisma.settlement.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SettlementCreateManyAndReturnArgs>(args?: SelectSubset<T, SettlementCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SettlementPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Settlement.
     * @param {SettlementDeleteArgs} args - Arguments to delete one Settlement.
     * @example
     * // Delete one Settlement
     * const Settlement = await prisma.settlement.delete({
     *   where: {
     *     // ... filter to delete one Settlement
     *   }
     * })
     * 
     */
    delete<T extends SettlementDeleteArgs>(args: SelectSubset<T, SettlementDeleteArgs<ExtArgs>>): Prisma__SettlementClient<$Result.GetResult<Prisma.$SettlementPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Settlement.
     * @param {SettlementUpdateArgs} args - Arguments to update one Settlement.
     * @example
     * // Update one Settlement
     * const settlement = await prisma.settlement.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SettlementUpdateArgs>(args: SelectSubset<T, SettlementUpdateArgs<ExtArgs>>): Prisma__SettlementClient<$Result.GetResult<Prisma.$SettlementPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Settlements.
     * @param {SettlementDeleteManyArgs} args - Arguments to filter Settlements to delete.
     * @example
     * // Delete a few Settlements
     * const { count } = await prisma.settlement.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SettlementDeleteManyArgs>(args?: SelectSubset<T, SettlementDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Settlements.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SettlementUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Settlements
     * const settlement = await prisma.settlement.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SettlementUpdateManyArgs>(args: SelectSubset<T, SettlementUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Settlements and returns the data updated in the database.
     * @param {SettlementUpdateManyAndReturnArgs} args - Arguments to update many Settlements.
     * @example
     * // Update many Settlements
     * const settlement = await prisma.settlement.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Settlements and only return the `id`
     * const settlementWithIdOnly = await prisma.settlement.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SettlementUpdateManyAndReturnArgs>(args: SelectSubset<T, SettlementUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SettlementPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Settlement.
     * @param {SettlementUpsertArgs} args - Arguments to update or create a Settlement.
     * @example
     * // Update or create a Settlement
     * const settlement = await prisma.settlement.upsert({
     *   create: {
     *     // ... data to create a Settlement
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Settlement we want to update
     *   }
     * })
     */
    upsert<T extends SettlementUpsertArgs>(args: SelectSubset<T, SettlementUpsertArgs<ExtArgs>>): Prisma__SettlementClient<$Result.GetResult<Prisma.$SettlementPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Settlements.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SettlementCountArgs} args - Arguments to filter Settlements to count.
     * @example
     * // Count the number of Settlements
     * const count = await prisma.settlement.count({
     *   where: {
     *     // ... the filter for the Settlements we want to count
     *   }
     * })
    **/
    count<T extends SettlementCountArgs>(
      args?: Subset<T, SettlementCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SettlementCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Settlement.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SettlementAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SettlementAggregateArgs>(args: Subset<T, SettlementAggregateArgs>): Prisma.PrismaPromise<GetSettlementAggregateType<T>>

    /**
     * Group by Settlement.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SettlementGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SettlementGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SettlementGroupByArgs['orderBy'] }
        : { orderBy?: SettlementGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SettlementGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSettlementGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Settlement model
   */
  readonly fields: SettlementFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Settlement.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SettlementClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    agreement<T extends AgreementDefaultArgs<ExtArgs> = {}>(args?: Subset<T, AgreementDefaultArgs<ExtArgs>>): Prisma__AgreementClient<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Settlement model
   */
  interface SettlementFieldRefs {
    readonly id: FieldRef<"Settlement", 'String'>
    readonly agreementId: FieldRef<"Settlement", 'String'>
    readonly nftMint: FieldRef<"Settlement", 'String'>
    readonly price: FieldRef<"Settlement", 'Decimal'>
    readonly platformFee: FieldRef<"Settlement", 'Decimal'>
    readonly creatorRoyalty: FieldRef<"Settlement", 'Decimal'>
    readonly sellerReceived: FieldRef<"Settlement", 'Decimal'>
    readonly settleTxId: FieldRef<"Settlement", 'String'>
    readonly blockHeight: FieldRef<"Settlement", 'BigInt'>
    readonly buyer: FieldRef<"Settlement", 'String'>
    readonly seller: FieldRef<"Settlement", 'String'>
    readonly feeCollector: FieldRef<"Settlement", 'String'>
    readonly royaltyRecipient: FieldRef<"Settlement", 'String'>
    readonly settledAt: FieldRef<"Settlement", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Settlement findUnique
   */
  export type SettlementFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Settlement
     */
    select?: SettlementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Settlement
     */
    omit?: SettlementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SettlementInclude<ExtArgs> | null
    /**
     * Filter, which Settlement to fetch.
     */
    where: SettlementWhereUniqueInput
  }

  /**
   * Settlement findUniqueOrThrow
   */
  export type SettlementFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Settlement
     */
    select?: SettlementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Settlement
     */
    omit?: SettlementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SettlementInclude<ExtArgs> | null
    /**
     * Filter, which Settlement to fetch.
     */
    where: SettlementWhereUniqueInput
  }

  /**
   * Settlement findFirst
   */
  export type SettlementFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Settlement
     */
    select?: SettlementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Settlement
     */
    omit?: SettlementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SettlementInclude<ExtArgs> | null
    /**
     * Filter, which Settlement to fetch.
     */
    where?: SettlementWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Settlements to fetch.
     */
    orderBy?: SettlementOrderByWithRelationInput | SettlementOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Settlements.
     */
    cursor?: SettlementWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Settlements from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Settlements.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Settlements.
     */
    distinct?: SettlementScalarFieldEnum | SettlementScalarFieldEnum[]
  }

  /**
   * Settlement findFirstOrThrow
   */
  export type SettlementFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Settlement
     */
    select?: SettlementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Settlement
     */
    omit?: SettlementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SettlementInclude<ExtArgs> | null
    /**
     * Filter, which Settlement to fetch.
     */
    where?: SettlementWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Settlements to fetch.
     */
    orderBy?: SettlementOrderByWithRelationInput | SettlementOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Settlements.
     */
    cursor?: SettlementWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Settlements from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Settlements.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Settlements.
     */
    distinct?: SettlementScalarFieldEnum | SettlementScalarFieldEnum[]
  }

  /**
   * Settlement findMany
   */
  export type SettlementFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Settlement
     */
    select?: SettlementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Settlement
     */
    omit?: SettlementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SettlementInclude<ExtArgs> | null
    /**
     * Filter, which Settlements to fetch.
     */
    where?: SettlementWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Settlements to fetch.
     */
    orderBy?: SettlementOrderByWithRelationInput | SettlementOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Settlements.
     */
    cursor?: SettlementWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Settlements from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Settlements.
     */
    skip?: number
    distinct?: SettlementScalarFieldEnum | SettlementScalarFieldEnum[]
  }

  /**
   * Settlement create
   */
  export type SettlementCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Settlement
     */
    select?: SettlementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Settlement
     */
    omit?: SettlementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SettlementInclude<ExtArgs> | null
    /**
     * The data needed to create a Settlement.
     */
    data: XOR<SettlementCreateInput, SettlementUncheckedCreateInput>
  }

  /**
   * Settlement createMany
   */
  export type SettlementCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Settlements.
     */
    data: SettlementCreateManyInput | SettlementCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Settlement createManyAndReturn
   */
  export type SettlementCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Settlement
     */
    select?: SettlementSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Settlement
     */
    omit?: SettlementOmit<ExtArgs> | null
    /**
     * The data used to create many Settlements.
     */
    data: SettlementCreateManyInput | SettlementCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SettlementIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Settlement update
   */
  export type SettlementUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Settlement
     */
    select?: SettlementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Settlement
     */
    omit?: SettlementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SettlementInclude<ExtArgs> | null
    /**
     * The data needed to update a Settlement.
     */
    data: XOR<SettlementUpdateInput, SettlementUncheckedUpdateInput>
    /**
     * Choose, which Settlement to update.
     */
    where: SettlementWhereUniqueInput
  }

  /**
   * Settlement updateMany
   */
  export type SettlementUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Settlements.
     */
    data: XOR<SettlementUpdateManyMutationInput, SettlementUncheckedUpdateManyInput>
    /**
     * Filter which Settlements to update
     */
    where?: SettlementWhereInput
    /**
     * Limit how many Settlements to update.
     */
    limit?: number
  }

  /**
   * Settlement updateManyAndReturn
   */
  export type SettlementUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Settlement
     */
    select?: SettlementSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Settlement
     */
    omit?: SettlementOmit<ExtArgs> | null
    /**
     * The data used to update Settlements.
     */
    data: XOR<SettlementUpdateManyMutationInput, SettlementUncheckedUpdateManyInput>
    /**
     * Filter which Settlements to update
     */
    where?: SettlementWhereInput
    /**
     * Limit how many Settlements to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SettlementIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Settlement upsert
   */
  export type SettlementUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Settlement
     */
    select?: SettlementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Settlement
     */
    omit?: SettlementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SettlementInclude<ExtArgs> | null
    /**
     * The filter to search for the Settlement to update in case it exists.
     */
    where: SettlementWhereUniqueInput
    /**
     * In case the Settlement found by the `where` argument doesn't exist, create a new Settlement with this data.
     */
    create: XOR<SettlementCreateInput, SettlementUncheckedCreateInput>
    /**
     * In case the Settlement was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SettlementUpdateInput, SettlementUncheckedUpdateInput>
  }

  /**
   * Settlement delete
   */
  export type SettlementDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Settlement
     */
    select?: SettlementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Settlement
     */
    omit?: SettlementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SettlementInclude<ExtArgs> | null
    /**
     * Filter which Settlement to delete.
     */
    where: SettlementWhereUniqueInput
  }

  /**
   * Settlement deleteMany
   */
  export type SettlementDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Settlements to delete
     */
    where?: SettlementWhereInput
    /**
     * Limit how many Settlements to delete.
     */
    limit?: number
  }

  /**
   * Settlement without action
   */
  export type SettlementDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Settlement
     */
    select?: SettlementSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Settlement
     */
    omit?: SettlementOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SettlementInclude<ExtArgs> | null
  }


  /**
   * Model Receipt
   */

  export type AggregateReceipt = {
    _count: ReceiptCountAggregateOutputType | null
    _avg: ReceiptAvgAggregateOutputType | null
    _sum: ReceiptSumAggregateOutputType | null
    _min: ReceiptMinAggregateOutputType | null
    _max: ReceiptMaxAggregateOutputType | null
  }

  export type ReceiptAvgAggregateOutputType = {
    price: Decimal | null
    platformFee: Decimal | null
    creatorRoyalty: Decimal | null
  }

  export type ReceiptSumAggregateOutputType = {
    price: Decimal | null
    platformFee: Decimal | null
    creatorRoyalty: Decimal | null
  }

  export type ReceiptMinAggregateOutputType = {
    id: string | null
    agreementId: string | null
    nftMint: string | null
    price: Decimal | null
    platformFee: Decimal | null
    creatorRoyalty: Decimal | null
    buyer: string | null
    seller: string | null
    escrowTxId: string | null
    settlementTxId: string | null
    receiptHash: string | null
    signature: string | null
    createdAt: Date | null
    settledAt: Date | null
    generatedAt: Date | null
  }

  export type ReceiptMaxAggregateOutputType = {
    id: string | null
    agreementId: string | null
    nftMint: string | null
    price: Decimal | null
    platformFee: Decimal | null
    creatorRoyalty: Decimal | null
    buyer: string | null
    seller: string | null
    escrowTxId: string | null
    settlementTxId: string | null
    receiptHash: string | null
    signature: string | null
    createdAt: Date | null
    settledAt: Date | null
    generatedAt: Date | null
  }

  export type ReceiptCountAggregateOutputType = {
    id: number
    agreementId: number
    nftMint: number
    price: number
    platformFee: number
    creatorRoyalty: number
    buyer: number
    seller: number
    escrowTxId: number
    settlementTxId: number
    receiptHash: number
    signature: number
    createdAt: number
    settledAt: number
    generatedAt: number
    _all: number
  }


  export type ReceiptAvgAggregateInputType = {
    price?: true
    platformFee?: true
    creatorRoyalty?: true
  }

  export type ReceiptSumAggregateInputType = {
    price?: true
    platformFee?: true
    creatorRoyalty?: true
  }

  export type ReceiptMinAggregateInputType = {
    id?: true
    agreementId?: true
    nftMint?: true
    price?: true
    platformFee?: true
    creatorRoyalty?: true
    buyer?: true
    seller?: true
    escrowTxId?: true
    settlementTxId?: true
    receiptHash?: true
    signature?: true
    createdAt?: true
    settledAt?: true
    generatedAt?: true
  }

  export type ReceiptMaxAggregateInputType = {
    id?: true
    agreementId?: true
    nftMint?: true
    price?: true
    platformFee?: true
    creatorRoyalty?: true
    buyer?: true
    seller?: true
    escrowTxId?: true
    settlementTxId?: true
    receiptHash?: true
    signature?: true
    createdAt?: true
    settledAt?: true
    generatedAt?: true
  }

  export type ReceiptCountAggregateInputType = {
    id?: true
    agreementId?: true
    nftMint?: true
    price?: true
    platformFee?: true
    creatorRoyalty?: true
    buyer?: true
    seller?: true
    escrowTxId?: true
    settlementTxId?: true
    receiptHash?: true
    signature?: true
    createdAt?: true
    settledAt?: true
    generatedAt?: true
    _all?: true
  }

  export type ReceiptAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Receipt to aggregate.
     */
    where?: ReceiptWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Receipts to fetch.
     */
    orderBy?: ReceiptOrderByWithRelationInput | ReceiptOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ReceiptWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Receipts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Receipts.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Receipts
    **/
    _count?: true | ReceiptCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ReceiptAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ReceiptSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ReceiptMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ReceiptMaxAggregateInputType
  }

  export type GetReceiptAggregateType<T extends ReceiptAggregateArgs> = {
        [P in keyof T & keyof AggregateReceipt]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateReceipt[P]>
      : GetScalarType<T[P], AggregateReceipt[P]>
  }




  export type ReceiptGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ReceiptWhereInput
    orderBy?: ReceiptOrderByWithAggregationInput | ReceiptOrderByWithAggregationInput[]
    by: ReceiptScalarFieldEnum[] | ReceiptScalarFieldEnum
    having?: ReceiptScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ReceiptCountAggregateInputType | true
    _avg?: ReceiptAvgAggregateInputType
    _sum?: ReceiptSumAggregateInputType
    _min?: ReceiptMinAggregateInputType
    _max?: ReceiptMaxAggregateInputType
  }

  export type ReceiptGroupByOutputType = {
    id: string
    agreementId: string
    nftMint: string
    price: Decimal
    platformFee: Decimal
    creatorRoyalty: Decimal | null
    buyer: string
    seller: string
    escrowTxId: string
    settlementTxId: string
    receiptHash: string
    signature: string
    createdAt: Date
    settledAt: Date
    generatedAt: Date
    _count: ReceiptCountAggregateOutputType | null
    _avg: ReceiptAvgAggregateOutputType | null
    _sum: ReceiptSumAggregateOutputType | null
    _min: ReceiptMinAggregateOutputType | null
    _max: ReceiptMaxAggregateOutputType | null
  }

  type GetReceiptGroupByPayload<T extends ReceiptGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ReceiptGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ReceiptGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ReceiptGroupByOutputType[P]>
            : GetScalarType<T[P], ReceiptGroupByOutputType[P]>
        }
      >
    >


  export type ReceiptSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    nftMint?: boolean
    price?: boolean
    platformFee?: boolean
    creatorRoyalty?: boolean
    buyer?: boolean
    seller?: boolean
    escrowTxId?: boolean
    settlementTxId?: boolean
    receiptHash?: boolean
    signature?: boolean
    createdAt?: boolean
    settledAt?: boolean
    generatedAt?: boolean
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["receipt"]>

  export type ReceiptSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    nftMint?: boolean
    price?: boolean
    platformFee?: boolean
    creatorRoyalty?: boolean
    buyer?: boolean
    seller?: boolean
    escrowTxId?: boolean
    settlementTxId?: boolean
    receiptHash?: boolean
    signature?: boolean
    createdAt?: boolean
    settledAt?: boolean
    generatedAt?: boolean
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["receipt"]>

  export type ReceiptSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    nftMint?: boolean
    price?: boolean
    platformFee?: boolean
    creatorRoyalty?: boolean
    buyer?: boolean
    seller?: boolean
    escrowTxId?: boolean
    settlementTxId?: boolean
    receiptHash?: boolean
    signature?: boolean
    createdAt?: boolean
    settledAt?: boolean
    generatedAt?: boolean
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["receipt"]>

  export type ReceiptSelectScalar = {
    id?: boolean
    agreementId?: boolean
    nftMint?: boolean
    price?: boolean
    platformFee?: boolean
    creatorRoyalty?: boolean
    buyer?: boolean
    seller?: boolean
    escrowTxId?: boolean
    settlementTxId?: boolean
    receiptHash?: boolean
    signature?: boolean
    createdAt?: boolean
    settledAt?: boolean
    generatedAt?: boolean
  }

  export type ReceiptOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "agreementId" | "nftMint" | "price" | "platformFee" | "creatorRoyalty" | "buyer" | "seller" | "escrowTxId" | "settlementTxId" | "receiptHash" | "signature" | "createdAt" | "settledAt" | "generatedAt", ExtArgs["result"]["receipt"]>
  export type ReceiptInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }
  export type ReceiptIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }
  export type ReceiptIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }

  export type $ReceiptPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Receipt"
    objects: {
      agreement: Prisma.$AgreementPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      agreementId: string
      nftMint: string
      price: Prisma.Decimal
      platformFee: Prisma.Decimal
      creatorRoyalty: Prisma.Decimal | null
      buyer: string
      seller: string
      escrowTxId: string
      settlementTxId: string
      receiptHash: string
      signature: string
      createdAt: Date
      settledAt: Date
      generatedAt: Date
    }, ExtArgs["result"]["receipt"]>
    composites: {}
  }

  type ReceiptGetPayload<S extends boolean | null | undefined | ReceiptDefaultArgs> = $Result.GetResult<Prisma.$ReceiptPayload, S>

  type ReceiptCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ReceiptFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ReceiptCountAggregateInputType | true
    }

  export interface ReceiptDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Receipt'], meta: { name: 'Receipt' } }
    /**
     * Find zero or one Receipt that matches the filter.
     * @param {ReceiptFindUniqueArgs} args - Arguments to find a Receipt
     * @example
     * // Get one Receipt
     * const receipt = await prisma.receipt.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ReceiptFindUniqueArgs>(args: SelectSubset<T, ReceiptFindUniqueArgs<ExtArgs>>): Prisma__ReceiptClient<$Result.GetResult<Prisma.$ReceiptPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Receipt that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ReceiptFindUniqueOrThrowArgs} args - Arguments to find a Receipt
     * @example
     * // Get one Receipt
     * const receipt = await prisma.receipt.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ReceiptFindUniqueOrThrowArgs>(args: SelectSubset<T, ReceiptFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ReceiptClient<$Result.GetResult<Prisma.$ReceiptPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Receipt that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReceiptFindFirstArgs} args - Arguments to find a Receipt
     * @example
     * // Get one Receipt
     * const receipt = await prisma.receipt.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ReceiptFindFirstArgs>(args?: SelectSubset<T, ReceiptFindFirstArgs<ExtArgs>>): Prisma__ReceiptClient<$Result.GetResult<Prisma.$ReceiptPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Receipt that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReceiptFindFirstOrThrowArgs} args - Arguments to find a Receipt
     * @example
     * // Get one Receipt
     * const receipt = await prisma.receipt.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ReceiptFindFirstOrThrowArgs>(args?: SelectSubset<T, ReceiptFindFirstOrThrowArgs<ExtArgs>>): Prisma__ReceiptClient<$Result.GetResult<Prisma.$ReceiptPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Receipts that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReceiptFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Receipts
     * const receipts = await prisma.receipt.findMany()
     * 
     * // Get first 10 Receipts
     * const receipts = await prisma.receipt.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const receiptWithIdOnly = await prisma.receipt.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ReceiptFindManyArgs>(args?: SelectSubset<T, ReceiptFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReceiptPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Receipt.
     * @param {ReceiptCreateArgs} args - Arguments to create a Receipt.
     * @example
     * // Create one Receipt
     * const Receipt = await prisma.receipt.create({
     *   data: {
     *     // ... data to create a Receipt
     *   }
     * })
     * 
     */
    create<T extends ReceiptCreateArgs>(args: SelectSubset<T, ReceiptCreateArgs<ExtArgs>>): Prisma__ReceiptClient<$Result.GetResult<Prisma.$ReceiptPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Receipts.
     * @param {ReceiptCreateManyArgs} args - Arguments to create many Receipts.
     * @example
     * // Create many Receipts
     * const receipt = await prisma.receipt.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ReceiptCreateManyArgs>(args?: SelectSubset<T, ReceiptCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Receipts and returns the data saved in the database.
     * @param {ReceiptCreateManyAndReturnArgs} args - Arguments to create many Receipts.
     * @example
     * // Create many Receipts
     * const receipt = await prisma.receipt.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Receipts and only return the `id`
     * const receiptWithIdOnly = await prisma.receipt.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ReceiptCreateManyAndReturnArgs>(args?: SelectSubset<T, ReceiptCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReceiptPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Receipt.
     * @param {ReceiptDeleteArgs} args - Arguments to delete one Receipt.
     * @example
     * // Delete one Receipt
     * const Receipt = await prisma.receipt.delete({
     *   where: {
     *     // ... filter to delete one Receipt
     *   }
     * })
     * 
     */
    delete<T extends ReceiptDeleteArgs>(args: SelectSubset<T, ReceiptDeleteArgs<ExtArgs>>): Prisma__ReceiptClient<$Result.GetResult<Prisma.$ReceiptPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Receipt.
     * @param {ReceiptUpdateArgs} args - Arguments to update one Receipt.
     * @example
     * // Update one Receipt
     * const receipt = await prisma.receipt.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ReceiptUpdateArgs>(args: SelectSubset<T, ReceiptUpdateArgs<ExtArgs>>): Prisma__ReceiptClient<$Result.GetResult<Prisma.$ReceiptPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Receipts.
     * @param {ReceiptDeleteManyArgs} args - Arguments to filter Receipts to delete.
     * @example
     * // Delete a few Receipts
     * const { count } = await prisma.receipt.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ReceiptDeleteManyArgs>(args?: SelectSubset<T, ReceiptDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Receipts.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReceiptUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Receipts
     * const receipt = await prisma.receipt.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ReceiptUpdateManyArgs>(args: SelectSubset<T, ReceiptUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Receipts and returns the data updated in the database.
     * @param {ReceiptUpdateManyAndReturnArgs} args - Arguments to update many Receipts.
     * @example
     * // Update many Receipts
     * const receipt = await prisma.receipt.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Receipts and only return the `id`
     * const receiptWithIdOnly = await prisma.receipt.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ReceiptUpdateManyAndReturnArgs>(args: SelectSubset<T, ReceiptUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReceiptPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Receipt.
     * @param {ReceiptUpsertArgs} args - Arguments to update or create a Receipt.
     * @example
     * // Update or create a Receipt
     * const receipt = await prisma.receipt.upsert({
     *   create: {
     *     // ... data to create a Receipt
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Receipt we want to update
     *   }
     * })
     */
    upsert<T extends ReceiptUpsertArgs>(args: SelectSubset<T, ReceiptUpsertArgs<ExtArgs>>): Prisma__ReceiptClient<$Result.GetResult<Prisma.$ReceiptPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Receipts.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReceiptCountArgs} args - Arguments to filter Receipts to count.
     * @example
     * // Count the number of Receipts
     * const count = await prisma.receipt.count({
     *   where: {
     *     // ... the filter for the Receipts we want to count
     *   }
     * })
    **/
    count<T extends ReceiptCountArgs>(
      args?: Subset<T, ReceiptCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ReceiptCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Receipt.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReceiptAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ReceiptAggregateArgs>(args: Subset<T, ReceiptAggregateArgs>): Prisma.PrismaPromise<GetReceiptAggregateType<T>>

    /**
     * Group by Receipt.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReceiptGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ReceiptGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ReceiptGroupByArgs['orderBy'] }
        : { orderBy?: ReceiptGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ReceiptGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetReceiptGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Receipt model
   */
  readonly fields: ReceiptFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Receipt.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ReceiptClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    agreement<T extends AgreementDefaultArgs<ExtArgs> = {}>(args?: Subset<T, AgreementDefaultArgs<ExtArgs>>): Prisma__AgreementClient<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Receipt model
   */
  interface ReceiptFieldRefs {
    readonly id: FieldRef<"Receipt", 'String'>
    readonly agreementId: FieldRef<"Receipt", 'String'>
    readonly nftMint: FieldRef<"Receipt", 'String'>
    readonly price: FieldRef<"Receipt", 'Decimal'>
    readonly platformFee: FieldRef<"Receipt", 'Decimal'>
    readonly creatorRoyalty: FieldRef<"Receipt", 'Decimal'>
    readonly buyer: FieldRef<"Receipt", 'String'>
    readonly seller: FieldRef<"Receipt", 'String'>
    readonly escrowTxId: FieldRef<"Receipt", 'String'>
    readonly settlementTxId: FieldRef<"Receipt", 'String'>
    readonly receiptHash: FieldRef<"Receipt", 'String'>
    readonly signature: FieldRef<"Receipt", 'String'>
    readonly createdAt: FieldRef<"Receipt", 'DateTime'>
    readonly settledAt: FieldRef<"Receipt", 'DateTime'>
    readonly generatedAt: FieldRef<"Receipt", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Receipt findUnique
   */
  export type ReceiptFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Receipt
     */
    select?: ReceiptSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Receipt
     */
    omit?: ReceiptOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReceiptInclude<ExtArgs> | null
    /**
     * Filter, which Receipt to fetch.
     */
    where: ReceiptWhereUniqueInput
  }

  /**
   * Receipt findUniqueOrThrow
   */
  export type ReceiptFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Receipt
     */
    select?: ReceiptSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Receipt
     */
    omit?: ReceiptOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReceiptInclude<ExtArgs> | null
    /**
     * Filter, which Receipt to fetch.
     */
    where: ReceiptWhereUniqueInput
  }

  /**
   * Receipt findFirst
   */
  export type ReceiptFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Receipt
     */
    select?: ReceiptSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Receipt
     */
    omit?: ReceiptOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReceiptInclude<ExtArgs> | null
    /**
     * Filter, which Receipt to fetch.
     */
    where?: ReceiptWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Receipts to fetch.
     */
    orderBy?: ReceiptOrderByWithRelationInput | ReceiptOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Receipts.
     */
    cursor?: ReceiptWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Receipts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Receipts.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Receipts.
     */
    distinct?: ReceiptScalarFieldEnum | ReceiptScalarFieldEnum[]
  }

  /**
   * Receipt findFirstOrThrow
   */
  export type ReceiptFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Receipt
     */
    select?: ReceiptSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Receipt
     */
    omit?: ReceiptOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReceiptInclude<ExtArgs> | null
    /**
     * Filter, which Receipt to fetch.
     */
    where?: ReceiptWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Receipts to fetch.
     */
    orderBy?: ReceiptOrderByWithRelationInput | ReceiptOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Receipts.
     */
    cursor?: ReceiptWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Receipts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Receipts.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Receipts.
     */
    distinct?: ReceiptScalarFieldEnum | ReceiptScalarFieldEnum[]
  }

  /**
   * Receipt findMany
   */
  export type ReceiptFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Receipt
     */
    select?: ReceiptSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Receipt
     */
    omit?: ReceiptOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReceiptInclude<ExtArgs> | null
    /**
     * Filter, which Receipts to fetch.
     */
    where?: ReceiptWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Receipts to fetch.
     */
    orderBy?: ReceiptOrderByWithRelationInput | ReceiptOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Receipts.
     */
    cursor?: ReceiptWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Receipts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Receipts.
     */
    skip?: number
    distinct?: ReceiptScalarFieldEnum | ReceiptScalarFieldEnum[]
  }

  /**
   * Receipt create
   */
  export type ReceiptCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Receipt
     */
    select?: ReceiptSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Receipt
     */
    omit?: ReceiptOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReceiptInclude<ExtArgs> | null
    /**
     * The data needed to create a Receipt.
     */
    data: XOR<ReceiptCreateInput, ReceiptUncheckedCreateInput>
  }

  /**
   * Receipt createMany
   */
  export type ReceiptCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Receipts.
     */
    data: ReceiptCreateManyInput | ReceiptCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Receipt createManyAndReturn
   */
  export type ReceiptCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Receipt
     */
    select?: ReceiptSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Receipt
     */
    omit?: ReceiptOmit<ExtArgs> | null
    /**
     * The data used to create many Receipts.
     */
    data: ReceiptCreateManyInput | ReceiptCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReceiptIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Receipt update
   */
  export type ReceiptUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Receipt
     */
    select?: ReceiptSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Receipt
     */
    omit?: ReceiptOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReceiptInclude<ExtArgs> | null
    /**
     * The data needed to update a Receipt.
     */
    data: XOR<ReceiptUpdateInput, ReceiptUncheckedUpdateInput>
    /**
     * Choose, which Receipt to update.
     */
    where: ReceiptWhereUniqueInput
  }

  /**
   * Receipt updateMany
   */
  export type ReceiptUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Receipts.
     */
    data: XOR<ReceiptUpdateManyMutationInput, ReceiptUncheckedUpdateManyInput>
    /**
     * Filter which Receipts to update
     */
    where?: ReceiptWhereInput
    /**
     * Limit how many Receipts to update.
     */
    limit?: number
  }

  /**
   * Receipt updateManyAndReturn
   */
  export type ReceiptUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Receipt
     */
    select?: ReceiptSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Receipt
     */
    omit?: ReceiptOmit<ExtArgs> | null
    /**
     * The data used to update Receipts.
     */
    data: XOR<ReceiptUpdateManyMutationInput, ReceiptUncheckedUpdateManyInput>
    /**
     * Filter which Receipts to update
     */
    where?: ReceiptWhereInput
    /**
     * Limit how many Receipts to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReceiptIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Receipt upsert
   */
  export type ReceiptUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Receipt
     */
    select?: ReceiptSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Receipt
     */
    omit?: ReceiptOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReceiptInclude<ExtArgs> | null
    /**
     * The filter to search for the Receipt to update in case it exists.
     */
    where: ReceiptWhereUniqueInput
    /**
     * In case the Receipt found by the `where` argument doesn't exist, create a new Receipt with this data.
     */
    create: XOR<ReceiptCreateInput, ReceiptUncheckedCreateInput>
    /**
     * In case the Receipt was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ReceiptUpdateInput, ReceiptUncheckedUpdateInput>
  }

  /**
   * Receipt delete
   */
  export type ReceiptDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Receipt
     */
    select?: ReceiptSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Receipt
     */
    omit?: ReceiptOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReceiptInclude<ExtArgs> | null
    /**
     * Filter which Receipt to delete.
     */
    where: ReceiptWhereUniqueInput
  }

  /**
   * Receipt deleteMany
   */
  export type ReceiptDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Receipts to delete
     */
    where?: ReceiptWhereInput
    /**
     * Limit how many Receipts to delete.
     */
    limit?: number
  }

  /**
   * Receipt without action
   */
  export type ReceiptDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Receipt
     */
    select?: ReceiptSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Receipt
     */
    omit?: ReceiptOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReceiptInclude<ExtArgs> | null
  }


  /**
   * Model TransactionLog
   */

  export type AggregateTransactionLog = {
    _count: TransactionLogCountAggregateOutputType | null
    _avg: TransactionLogAvgAggregateOutputType | null
    _sum: TransactionLogSumAggregateOutputType | null
    _min: TransactionLogMinAggregateOutputType | null
    _max: TransactionLogMaxAggregateOutputType | null
  }

  export type TransactionLogAvgAggregateOutputType = {
    blockHeight: number | null
    slot: number | null
  }

  export type TransactionLogSumAggregateOutputType = {
    blockHeight: bigint | null
    slot: bigint | null
  }

  export type TransactionLogMinAggregateOutputType = {
    id: string | null
    agreementId: string | null
    txId: string | null
    operationType: string | null
    blockHeight: bigint | null
    slot: bigint | null
    status: string | null
    errorMessage: string | null
    timestamp: Date | null
  }

  export type TransactionLogMaxAggregateOutputType = {
    id: string | null
    agreementId: string | null
    txId: string | null
    operationType: string | null
    blockHeight: bigint | null
    slot: bigint | null
    status: string | null
    errorMessage: string | null
    timestamp: Date | null
  }

  export type TransactionLogCountAggregateOutputType = {
    id: number
    agreementId: number
    txId: number
    operationType: number
    blockHeight: number
    slot: number
    status: number
    errorMessage: number
    timestamp: number
    _all: number
  }


  export type TransactionLogAvgAggregateInputType = {
    blockHeight?: true
    slot?: true
  }

  export type TransactionLogSumAggregateInputType = {
    blockHeight?: true
    slot?: true
  }

  export type TransactionLogMinAggregateInputType = {
    id?: true
    agreementId?: true
    txId?: true
    operationType?: true
    blockHeight?: true
    slot?: true
    status?: true
    errorMessage?: true
    timestamp?: true
  }

  export type TransactionLogMaxAggregateInputType = {
    id?: true
    agreementId?: true
    txId?: true
    operationType?: true
    blockHeight?: true
    slot?: true
    status?: true
    errorMessage?: true
    timestamp?: true
  }

  export type TransactionLogCountAggregateInputType = {
    id?: true
    agreementId?: true
    txId?: true
    operationType?: true
    blockHeight?: true
    slot?: true
    status?: true
    errorMessage?: true
    timestamp?: true
    _all?: true
  }

  export type TransactionLogAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TransactionLog to aggregate.
     */
    where?: TransactionLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TransactionLogs to fetch.
     */
    orderBy?: TransactionLogOrderByWithRelationInput | TransactionLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TransactionLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TransactionLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TransactionLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned TransactionLogs
    **/
    _count?: true | TransactionLogCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: TransactionLogAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: TransactionLogSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TransactionLogMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TransactionLogMaxAggregateInputType
  }

  export type GetTransactionLogAggregateType<T extends TransactionLogAggregateArgs> = {
        [P in keyof T & keyof AggregateTransactionLog]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTransactionLog[P]>
      : GetScalarType<T[P], AggregateTransactionLog[P]>
  }




  export type TransactionLogGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TransactionLogWhereInput
    orderBy?: TransactionLogOrderByWithAggregationInput | TransactionLogOrderByWithAggregationInput[]
    by: TransactionLogScalarFieldEnum[] | TransactionLogScalarFieldEnum
    having?: TransactionLogScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TransactionLogCountAggregateInputType | true
    _avg?: TransactionLogAvgAggregateInputType
    _sum?: TransactionLogSumAggregateInputType
    _min?: TransactionLogMinAggregateInputType
    _max?: TransactionLogMaxAggregateInputType
  }

  export type TransactionLogGroupByOutputType = {
    id: string
    agreementId: string | null
    txId: string
    operationType: string
    blockHeight: bigint | null
    slot: bigint | null
    status: string
    errorMessage: string | null
    timestamp: Date
    _count: TransactionLogCountAggregateOutputType | null
    _avg: TransactionLogAvgAggregateOutputType | null
    _sum: TransactionLogSumAggregateOutputType | null
    _min: TransactionLogMinAggregateOutputType | null
    _max: TransactionLogMaxAggregateOutputType | null
  }

  type GetTransactionLogGroupByPayload<T extends TransactionLogGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TransactionLogGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TransactionLogGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TransactionLogGroupByOutputType[P]>
            : GetScalarType<T[P], TransactionLogGroupByOutputType[P]>
        }
      >
    >


  export type TransactionLogSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    txId?: boolean
    operationType?: boolean
    blockHeight?: boolean
    slot?: boolean
    status?: boolean
    errorMessage?: boolean
    timestamp?: boolean
  }, ExtArgs["result"]["transactionLog"]>

  export type TransactionLogSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    txId?: boolean
    operationType?: boolean
    blockHeight?: boolean
    slot?: boolean
    status?: boolean
    errorMessage?: boolean
    timestamp?: boolean
  }, ExtArgs["result"]["transactionLog"]>

  export type TransactionLogSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    txId?: boolean
    operationType?: boolean
    blockHeight?: boolean
    slot?: boolean
    status?: boolean
    errorMessage?: boolean
    timestamp?: boolean
  }, ExtArgs["result"]["transactionLog"]>

  export type TransactionLogSelectScalar = {
    id?: boolean
    agreementId?: boolean
    txId?: boolean
    operationType?: boolean
    blockHeight?: boolean
    slot?: boolean
    status?: boolean
    errorMessage?: boolean
    timestamp?: boolean
  }

  export type TransactionLogOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "agreementId" | "txId" | "operationType" | "blockHeight" | "slot" | "status" | "errorMessage" | "timestamp", ExtArgs["result"]["transactionLog"]>

  export type $TransactionLogPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "TransactionLog"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      agreementId: string | null
      txId: string
      operationType: string
      blockHeight: bigint | null
      slot: bigint | null
      status: string
      errorMessage: string | null
      timestamp: Date
    }, ExtArgs["result"]["transactionLog"]>
    composites: {}
  }

  type TransactionLogGetPayload<S extends boolean | null | undefined | TransactionLogDefaultArgs> = $Result.GetResult<Prisma.$TransactionLogPayload, S>

  type TransactionLogCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TransactionLogFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TransactionLogCountAggregateInputType | true
    }

  export interface TransactionLogDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['TransactionLog'], meta: { name: 'TransactionLog' } }
    /**
     * Find zero or one TransactionLog that matches the filter.
     * @param {TransactionLogFindUniqueArgs} args - Arguments to find a TransactionLog
     * @example
     * // Get one TransactionLog
     * const transactionLog = await prisma.transactionLog.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TransactionLogFindUniqueArgs>(args: SelectSubset<T, TransactionLogFindUniqueArgs<ExtArgs>>): Prisma__TransactionLogClient<$Result.GetResult<Prisma.$TransactionLogPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one TransactionLog that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TransactionLogFindUniqueOrThrowArgs} args - Arguments to find a TransactionLog
     * @example
     * // Get one TransactionLog
     * const transactionLog = await prisma.transactionLog.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TransactionLogFindUniqueOrThrowArgs>(args: SelectSubset<T, TransactionLogFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TransactionLogClient<$Result.GetResult<Prisma.$TransactionLogPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TransactionLog that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionLogFindFirstArgs} args - Arguments to find a TransactionLog
     * @example
     * // Get one TransactionLog
     * const transactionLog = await prisma.transactionLog.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TransactionLogFindFirstArgs>(args?: SelectSubset<T, TransactionLogFindFirstArgs<ExtArgs>>): Prisma__TransactionLogClient<$Result.GetResult<Prisma.$TransactionLogPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TransactionLog that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionLogFindFirstOrThrowArgs} args - Arguments to find a TransactionLog
     * @example
     * // Get one TransactionLog
     * const transactionLog = await prisma.transactionLog.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TransactionLogFindFirstOrThrowArgs>(args?: SelectSubset<T, TransactionLogFindFirstOrThrowArgs<ExtArgs>>): Prisma__TransactionLogClient<$Result.GetResult<Prisma.$TransactionLogPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more TransactionLogs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionLogFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all TransactionLogs
     * const transactionLogs = await prisma.transactionLog.findMany()
     * 
     * // Get first 10 TransactionLogs
     * const transactionLogs = await prisma.transactionLog.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const transactionLogWithIdOnly = await prisma.transactionLog.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TransactionLogFindManyArgs>(args?: SelectSubset<T, TransactionLogFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TransactionLogPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a TransactionLog.
     * @param {TransactionLogCreateArgs} args - Arguments to create a TransactionLog.
     * @example
     * // Create one TransactionLog
     * const TransactionLog = await prisma.transactionLog.create({
     *   data: {
     *     // ... data to create a TransactionLog
     *   }
     * })
     * 
     */
    create<T extends TransactionLogCreateArgs>(args: SelectSubset<T, TransactionLogCreateArgs<ExtArgs>>): Prisma__TransactionLogClient<$Result.GetResult<Prisma.$TransactionLogPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many TransactionLogs.
     * @param {TransactionLogCreateManyArgs} args - Arguments to create many TransactionLogs.
     * @example
     * // Create many TransactionLogs
     * const transactionLog = await prisma.transactionLog.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TransactionLogCreateManyArgs>(args?: SelectSubset<T, TransactionLogCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many TransactionLogs and returns the data saved in the database.
     * @param {TransactionLogCreateManyAndReturnArgs} args - Arguments to create many TransactionLogs.
     * @example
     * // Create many TransactionLogs
     * const transactionLog = await prisma.transactionLog.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many TransactionLogs and only return the `id`
     * const transactionLogWithIdOnly = await prisma.transactionLog.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TransactionLogCreateManyAndReturnArgs>(args?: SelectSubset<T, TransactionLogCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TransactionLogPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a TransactionLog.
     * @param {TransactionLogDeleteArgs} args - Arguments to delete one TransactionLog.
     * @example
     * // Delete one TransactionLog
     * const TransactionLog = await prisma.transactionLog.delete({
     *   where: {
     *     // ... filter to delete one TransactionLog
     *   }
     * })
     * 
     */
    delete<T extends TransactionLogDeleteArgs>(args: SelectSubset<T, TransactionLogDeleteArgs<ExtArgs>>): Prisma__TransactionLogClient<$Result.GetResult<Prisma.$TransactionLogPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one TransactionLog.
     * @param {TransactionLogUpdateArgs} args - Arguments to update one TransactionLog.
     * @example
     * // Update one TransactionLog
     * const transactionLog = await prisma.transactionLog.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TransactionLogUpdateArgs>(args: SelectSubset<T, TransactionLogUpdateArgs<ExtArgs>>): Prisma__TransactionLogClient<$Result.GetResult<Prisma.$TransactionLogPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more TransactionLogs.
     * @param {TransactionLogDeleteManyArgs} args - Arguments to filter TransactionLogs to delete.
     * @example
     * // Delete a few TransactionLogs
     * const { count } = await prisma.transactionLog.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TransactionLogDeleteManyArgs>(args?: SelectSubset<T, TransactionLogDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TransactionLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionLogUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many TransactionLogs
     * const transactionLog = await prisma.transactionLog.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TransactionLogUpdateManyArgs>(args: SelectSubset<T, TransactionLogUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TransactionLogs and returns the data updated in the database.
     * @param {TransactionLogUpdateManyAndReturnArgs} args - Arguments to update many TransactionLogs.
     * @example
     * // Update many TransactionLogs
     * const transactionLog = await prisma.transactionLog.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more TransactionLogs and only return the `id`
     * const transactionLogWithIdOnly = await prisma.transactionLog.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends TransactionLogUpdateManyAndReturnArgs>(args: SelectSubset<T, TransactionLogUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TransactionLogPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one TransactionLog.
     * @param {TransactionLogUpsertArgs} args - Arguments to update or create a TransactionLog.
     * @example
     * // Update or create a TransactionLog
     * const transactionLog = await prisma.transactionLog.upsert({
     *   create: {
     *     // ... data to create a TransactionLog
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the TransactionLog we want to update
     *   }
     * })
     */
    upsert<T extends TransactionLogUpsertArgs>(args: SelectSubset<T, TransactionLogUpsertArgs<ExtArgs>>): Prisma__TransactionLogClient<$Result.GetResult<Prisma.$TransactionLogPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of TransactionLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionLogCountArgs} args - Arguments to filter TransactionLogs to count.
     * @example
     * // Count the number of TransactionLogs
     * const count = await prisma.transactionLog.count({
     *   where: {
     *     // ... the filter for the TransactionLogs we want to count
     *   }
     * })
    **/
    count<T extends TransactionLogCountArgs>(
      args?: Subset<T, TransactionLogCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TransactionLogCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a TransactionLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionLogAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TransactionLogAggregateArgs>(args: Subset<T, TransactionLogAggregateArgs>): Prisma.PrismaPromise<GetTransactionLogAggregateType<T>>

    /**
     * Group by TransactionLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionLogGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TransactionLogGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TransactionLogGroupByArgs['orderBy'] }
        : { orderBy?: TransactionLogGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TransactionLogGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTransactionLogGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the TransactionLog model
   */
  readonly fields: TransactionLogFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for TransactionLog.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TransactionLogClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the TransactionLog model
   */
  interface TransactionLogFieldRefs {
    readonly id: FieldRef<"TransactionLog", 'String'>
    readonly agreementId: FieldRef<"TransactionLog", 'String'>
    readonly txId: FieldRef<"TransactionLog", 'String'>
    readonly operationType: FieldRef<"TransactionLog", 'String'>
    readonly blockHeight: FieldRef<"TransactionLog", 'BigInt'>
    readonly slot: FieldRef<"TransactionLog", 'BigInt'>
    readonly status: FieldRef<"TransactionLog", 'String'>
    readonly errorMessage: FieldRef<"TransactionLog", 'String'>
    readonly timestamp: FieldRef<"TransactionLog", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * TransactionLog findUnique
   */
  export type TransactionLogFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TransactionLog
     */
    select?: TransactionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TransactionLog
     */
    omit?: TransactionLogOmit<ExtArgs> | null
    /**
     * Filter, which TransactionLog to fetch.
     */
    where: TransactionLogWhereUniqueInput
  }

  /**
   * TransactionLog findUniqueOrThrow
   */
  export type TransactionLogFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TransactionLog
     */
    select?: TransactionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TransactionLog
     */
    omit?: TransactionLogOmit<ExtArgs> | null
    /**
     * Filter, which TransactionLog to fetch.
     */
    where: TransactionLogWhereUniqueInput
  }

  /**
   * TransactionLog findFirst
   */
  export type TransactionLogFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TransactionLog
     */
    select?: TransactionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TransactionLog
     */
    omit?: TransactionLogOmit<ExtArgs> | null
    /**
     * Filter, which TransactionLog to fetch.
     */
    where?: TransactionLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TransactionLogs to fetch.
     */
    orderBy?: TransactionLogOrderByWithRelationInput | TransactionLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TransactionLogs.
     */
    cursor?: TransactionLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TransactionLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TransactionLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TransactionLogs.
     */
    distinct?: TransactionLogScalarFieldEnum | TransactionLogScalarFieldEnum[]
  }

  /**
   * TransactionLog findFirstOrThrow
   */
  export type TransactionLogFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TransactionLog
     */
    select?: TransactionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TransactionLog
     */
    omit?: TransactionLogOmit<ExtArgs> | null
    /**
     * Filter, which TransactionLog to fetch.
     */
    where?: TransactionLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TransactionLogs to fetch.
     */
    orderBy?: TransactionLogOrderByWithRelationInput | TransactionLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TransactionLogs.
     */
    cursor?: TransactionLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TransactionLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TransactionLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TransactionLogs.
     */
    distinct?: TransactionLogScalarFieldEnum | TransactionLogScalarFieldEnum[]
  }

  /**
   * TransactionLog findMany
   */
  export type TransactionLogFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TransactionLog
     */
    select?: TransactionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TransactionLog
     */
    omit?: TransactionLogOmit<ExtArgs> | null
    /**
     * Filter, which TransactionLogs to fetch.
     */
    where?: TransactionLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TransactionLogs to fetch.
     */
    orderBy?: TransactionLogOrderByWithRelationInput | TransactionLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing TransactionLogs.
     */
    cursor?: TransactionLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TransactionLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TransactionLogs.
     */
    skip?: number
    distinct?: TransactionLogScalarFieldEnum | TransactionLogScalarFieldEnum[]
  }

  /**
   * TransactionLog create
   */
  export type TransactionLogCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TransactionLog
     */
    select?: TransactionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TransactionLog
     */
    omit?: TransactionLogOmit<ExtArgs> | null
    /**
     * The data needed to create a TransactionLog.
     */
    data: XOR<TransactionLogCreateInput, TransactionLogUncheckedCreateInput>
  }

  /**
   * TransactionLog createMany
   */
  export type TransactionLogCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many TransactionLogs.
     */
    data: TransactionLogCreateManyInput | TransactionLogCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * TransactionLog createManyAndReturn
   */
  export type TransactionLogCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TransactionLog
     */
    select?: TransactionLogSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TransactionLog
     */
    omit?: TransactionLogOmit<ExtArgs> | null
    /**
     * The data used to create many TransactionLogs.
     */
    data: TransactionLogCreateManyInput | TransactionLogCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * TransactionLog update
   */
  export type TransactionLogUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TransactionLog
     */
    select?: TransactionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TransactionLog
     */
    omit?: TransactionLogOmit<ExtArgs> | null
    /**
     * The data needed to update a TransactionLog.
     */
    data: XOR<TransactionLogUpdateInput, TransactionLogUncheckedUpdateInput>
    /**
     * Choose, which TransactionLog to update.
     */
    where: TransactionLogWhereUniqueInput
  }

  /**
   * TransactionLog updateMany
   */
  export type TransactionLogUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update TransactionLogs.
     */
    data: XOR<TransactionLogUpdateManyMutationInput, TransactionLogUncheckedUpdateManyInput>
    /**
     * Filter which TransactionLogs to update
     */
    where?: TransactionLogWhereInput
    /**
     * Limit how many TransactionLogs to update.
     */
    limit?: number
  }

  /**
   * TransactionLog updateManyAndReturn
   */
  export type TransactionLogUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TransactionLog
     */
    select?: TransactionLogSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TransactionLog
     */
    omit?: TransactionLogOmit<ExtArgs> | null
    /**
     * The data used to update TransactionLogs.
     */
    data: XOR<TransactionLogUpdateManyMutationInput, TransactionLogUncheckedUpdateManyInput>
    /**
     * Filter which TransactionLogs to update
     */
    where?: TransactionLogWhereInput
    /**
     * Limit how many TransactionLogs to update.
     */
    limit?: number
  }

  /**
   * TransactionLog upsert
   */
  export type TransactionLogUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TransactionLog
     */
    select?: TransactionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TransactionLog
     */
    omit?: TransactionLogOmit<ExtArgs> | null
    /**
     * The filter to search for the TransactionLog to update in case it exists.
     */
    where: TransactionLogWhereUniqueInput
    /**
     * In case the TransactionLog found by the `where` argument doesn't exist, create a new TransactionLog with this data.
     */
    create: XOR<TransactionLogCreateInput, TransactionLogUncheckedCreateInput>
    /**
     * In case the TransactionLog was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TransactionLogUpdateInput, TransactionLogUncheckedUpdateInput>
  }

  /**
   * TransactionLog delete
   */
  export type TransactionLogDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TransactionLog
     */
    select?: TransactionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TransactionLog
     */
    omit?: TransactionLogOmit<ExtArgs> | null
    /**
     * Filter which TransactionLog to delete.
     */
    where: TransactionLogWhereUniqueInput
  }

  /**
   * TransactionLog deleteMany
   */
  export type TransactionLogDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TransactionLogs to delete
     */
    where?: TransactionLogWhereInput
    /**
     * Limit how many TransactionLogs to delete.
     */
    limit?: number
  }

  /**
   * TransactionLog without action
   */
  export type TransactionLogDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TransactionLog
     */
    select?: TransactionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TransactionLog
     */
    omit?: TransactionLogOmit<ExtArgs> | null
  }


  /**
   * Model Webhook
   */

  export type AggregateWebhook = {
    _count: WebhookCountAggregateOutputType | null
    _avg: WebhookAvgAggregateOutputType | null
    _sum: WebhookSumAggregateOutputType | null
    _min: WebhookMinAggregateOutputType | null
    _max: WebhookMaxAggregateOutputType | null
  }

  export type WebhookAvgAggregateOutputType = {
    attempts: number | null
    maxAttempts: number | null
    lastResponseCode: number | null
  }

  export type WebhookSumAggregateOutputType = {
    attempts: number | null
    maxAttempts: number | null
    lastResponseCode: number | null
  }

  export type WebhookMinAggregateOutputType = {
    id: string | null
    agreementId: string | null
    eventType: $Enums.WebhookEventType | null
    targetUrl: string | null
    status: $Enums.WebhookDeliveryStatus | null
    attempts: number | null
    maxAttempts: number | null
    lastAttemptAt: Date | null
    lastResponseCode: number | null
    lastResponseBody: string | null
    deliveredAt: Date | null
    signature: string | null
    createdAt: Date | null
    scheduledFor: Date | null
  }

  export type WebhookMaxAggregateOutputType = {
    id: string | null
    agreementId: string | null
    eventType: $Enums.WebhookEventType | null
    targetUrl: string | null
    status: $Enums.WebhookDeliveryStatus | null
    attempts: number | null
    maxAttempts: number | null
    lastAttemptAt: Date | null
    lastResponseCode: number | null
    lastResponseBody: string | null
    deliveredAt: Date | null
    signature: string | null
    createdAt: Date | null
    scheduledFor: Date | null
  }

  export type WebhookCountAggregateOutputType = {
    id: number
    agreementId: number
    eventType: number
    targetUrl: number
    payload: number
    status: number
    attempts: number
    maxAttempts: number
    lastAttemptAt: number
    lastResponseCode: number
    lastResponseBody: number
    deliveredAt: number
    signature: number
    createdAt: number
    scheduledFor: number
    _all: number
  }


  export type WebhookAvgAggregateInputType = {
    attempts?: true
    maxAttempts?: true
    lastResponseCode?: true
  }

  export type WebhookSumAggregateInputType = {
    attempts?: true
    maxAttempts?: true
    lastResponseCode?: true
  }

  export type WebhookMinAggregateInputType = {
    id?: true
    agreementId?: true
    eventType?: true
    targetUrl?: true
    status?: true
    attempts?: true
    maxAttempts?: true
    lastAttemptAt?: true
    lastResponseCode?: true
    lastResponseBody?: true
    deliveredAt?: true
    signature?: true
    createdAt?: true
    scheduledFor?: true
  }

  export type WebhookMaxAggregateInputType = {
    id?: true
    agreementId?: true
    eventType?: true
    targetUrl?: true
    status?: true
    attempts?: true
    maxAttempts?: true
    lastAttemptAt?: true
    lastResponseCode?: true
    lastResponseBody?: true
    deliveredAt?: true
    signature?: true
    createdAt?: true
    scheduledFor?: true
  }

  export type WebhookCountAggregateInputType = {
    id?: true
    agreementId?: true
    eventType?: true
    targetUrl?: true
    payload?: true
    status?: true
    attempts?: true
    maxAttempts?: true
    lastAttemptAt?: true
    lastResponseCode?: true
    lastResponseBody?: true
    deliveredAt?: true
    signature?: true
    createdAt?: true
    scheduledFor?: true
    _all?: true
  }

  export type WebhookAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Webhook to aggregate.
     */
    where?: WebhookWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Webhooks to fetch.
     */
    orderBy?: WebhookOrderByWithRelationInput | WebhookOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: WebhookWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Webhooks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Webhooks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Webhooks
    **/
    _count?: true | WebhookCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: WebhookAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: WebhookSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: WebhookMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: WebhookMaxAggregateInputType
  }

  export type GetWebhookAggregateType<T extends WebhookAggregateArgs> = {
        [P in keyof T & keyof AggregateWebhook]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateWebhook[P]>
      : GetScalarType<T[P], AggregateWebhook[P]>
  }




  export type WebhookGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WebhookWhereInput
    orderBy?: WebhookOrderByWithAggregationInput | WebhookOrderByWithAggregationInput[]
    by: WebhookScalarFieldEnum[] | WebhookScalarFieldEnum
    having?: WebhookScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: WebhookCountAggregateInputType | true
    _avg?: WebhookAvgAggregateInputType
    _sum?: WebhookSumAggregateInputType
    _min?: WebhookMinAggregateInputType
    _max?: WebhookMaxAggregateInputType
  }

  export type WebhookGroupByOutputType = {
    id: string
    agreementId: string
    eventType: $Enums.WebhookEventType
    targetUrl: string
    payload: JsonValue
    status: $Enums.WebhookDeliveryStatus
    attempts: number
    maxAttempts: number
    lastAttemptAt: Date | null
    lastResponseCode: number | null
    lastResponseBody: string | null
    deliveredAt: Date | null
    signature: string | null
    createdAt: Date
    scheduledFor: Date
    _count: WebhookCountAggregateOutputType | null
    _avg: WebhookAvgAggregateOutputType | null
    _sum: WebhookSumAggregateOutputType | null
    _min: WebhookMinAggregateOutputType | null
    _max: WebhookMaxAggregateOutputType | null
  }

  type GetWebhookGroupByPayload<T extends WebhookGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<WebhookGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof WebhookGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], WebhookGroupByOutputType[P]>
            : GetScalarType<T[P], WebhookGroupByOutputType[P]>
        }
      >
    >


  export type WebhookSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    eventType?: boolean
    targetUrl?: boolean
    payload?: boolean
    status?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    lastAttemptAt?: boolean
    lastResponseCode?: boolean
    lastResponseBody?: boolean
    deliveredAt?: boolean
    signature?: boolean
    createdAt?: boolean
    scheduledFor?: boolean
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["webhook"]>

  export type WebhookSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    eventType?: boolean
    targetUrl?: boolean
    payload?: boolean
    status?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    lastAttemptAt?: boolean
    lastResponseCode?: boolean
    lastResponseBody?: boolean
    deliveredAt?: boolean
    signature?: boolean
    createdAt?: boolean
    scheduledFor?: boolean
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["webhook"]>

  export type WebhookSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    agreementId?: boolean
    eventType?: boolean
    targetUrl?: boolean
    payload?: boolean
    status?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    lastAttemptAt?: boolean
    lastResponseCode?: boolean
    lastResponseBody?: boolean
    deliveredAt?: boolean
    signature?: boolean
    createdAt?: boolean
    scheduledFor?: boolean
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["webhook"]>

  export type WebhookSelectScalar = {
    id?: boolean
    agreementId?: boolean
    eventType?: boolean
    targetUrl?: boolean
    payload?: boolean
    status?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    lastAttemptAt?: boolean
    lastResponseCode?: boolean
    lastResponseBody?: boolean
    deliveredAt?: boolean
    signature?: boolean
    createdAt?: boolean
    scheduledFor?: boolean
  }

  export type WebhookOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "agreementId" | "eventType" | "targetUrl" | "payload" | "status" | "attempts" | "maxAttempts" | "lastAttemptAt" | "lastResponseCode" | "lastResponseBody" | "deliveredAt" | "signature" | "createdAt" | "scheduledFor", ExtArgs["result"]["webhook"]>
  export type WebhookInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }
  export type WebhookIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }
  export type WebhookIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    agreement?: boolean | AgreementDefaultArgs<ExtArgs>
  }

  export type $WebhookPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Webhook"
    objects: {
      agreement: Prisma.$AgreementPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      agreementId: string
      eventType: $Enums.WebhookEventType
      targetUrl: string
      payload: Prisma.JsonValue
      status: $Enums.WebhookDeliveryStatus
      attempts: number
      maxAttempts: number
      lastAttemptAt: Date | null
      lastResponseCode: number | null
      lastResponseBody: string | null
      deliveredAt: Date | null
      signature: string | null
      createdAt: Date
      scheduledFor: Date
    }, ExtArgs["result"]["webhook"]>
    composites: {}
  }

  type WebhookGetPayload<S extends boolean | null | undefined | WebhookDefaultArgs> = $Result.GetResult<Prisma.$WebhookPayload, S>

  type WebhookCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<WebhookFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: WebhookCountAggregateInputType | true
    }

  export interface WebhookDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Webhook'], meta: { name: 'Webhook' } }
    /**
     * Find zero or one Webhook that matches the filter.
     * @param {WebhookFindUniqueArgs} args - Arguments to find a Webhook
     * @example
     * // Get one Webhook
     * const webhook = await prisma.webhook.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WebhookFindUniqueArgs>(args: SelectSubset<T, WebhookFindUniqueArgs<ExtArgs>>): Prisma__WebhookClient<$Result.GetResult<Prisma.$WebhookPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Webhook that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WebhookFindUniqueOrThrowArgs} args - Arguments to find a Webhook
     * @example
     * // Get one Webhook
     * const webhook = await prisma.webhook.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WebhookFindUniqueOrThrowArgs>(args: SelectSubset<T, WebhookFindUniqueOrThrowArgs<ExtArgs>>): Prisma__WebhookClient<$Result.GetResult<Prisma.$WebhookPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Webhook that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookFindFirstArgs} args - Arguments to find a Webhook
     * @example
     * // Get one Webhook
     * const webhook = await prisma.webhook.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WebhookFindFirstArgs>(args?: SelectSubset<T, WebhookFindFirstArgs<ExtArgs>>): Prisma__WebhookClient<$Result.GetResult<Prisma.$WebhookPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Webhook that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookFindFirstOrThrowArgs} args - Arguments to find a Webhook
     * @example
     * // Get one Webhook
     * const webhook = await prisma.webhook.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WebhookFindFirstOrThrowArgs>(args?: SelectSubset<T, WebhookFindFirstOrThrowArgs<ExtArgs>>): Prisma__WebhookClient<$Result.GetResult<Prisma.$WebhookPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Webhooks that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Webhooks
     * const webhooks = await prisma.webhook.findMany()
     * 
     * // Get first 10 Webhooks
     * const webhooks = await prisma.webhook.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const webhookWithIdOnly = await prisma.webhook.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends WebhookFindManyArgs>(args?: SelectSubset<T, WebhookFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WebhookPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Webhook.
     * @param {WebhookCreateArgs} args - Arguments to create a Webhook.
     * @example
     * // Create one Webhook
     * const Webhook = await prisma.webhook.create({
     *   data: {
     *     // ... data to create a Webhook
     *   }
     * })
     * 
     */
    create<T extends WebhookCreateArgs>(args: SelectSubset<T, WebhookCreateArgs<ExtArgs>>): Prisma__WebhookClient<$Result.GetResult<Prisma.$WebhookPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Webhooks.
     * @param {WebhookCreateManyArgs} args - Arguments to create many Webhooks.
     * @example
     * // Create many Webhooks
     * const webhook = await prisma.webhook.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends WebhookCreateManyArgs>(args?: SelectSubset<T, WebhookCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Webhooks and returns the data saved in the database.
     * @param {WebhookCreateManyAndReturnArgs} args - Arguments to create many Webhooks.
     * @example
     * // Create many Webhooks
     * const webhook = await prisma.webhook.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Webhooks and only return the `id`
     * const webhookWithIdOnly = await prisma.webhook.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends WebhookCreateManyAndReturnArgs>(args?: SelectSubset<T, WebhookCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WebhookPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Webhook.
     * @param {WebhookDeleteArgs} args - Arguments to delete one Webhook.
     * @example
     * // Delete one Webhook
     * const Webhook = await prisma.webhook.delete({
     *   where: {
     *     // ... filter to delete one Webhook
     *   }
     * })
     * 
     */
    delete<T extends WebhookDeleteArgs>(args: SelectSubset<T, WebhookDeleteArgs<ExtArgs>>): Prisma__WebhookClient<$Result.GetResult<Prisma.$WebhookPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Webhook.
     * @param {WebhookUpdateArgs} args - Arguments to update one Webhook.
     * @example
     * // Update one Webhook
     * const webhook = await prisma.webhook.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends WebhookUpdateArgs>(args: SelectSubset<T, WebhookUpdateArgs<ExtArgs>>): Prisma__WebhookClient<$Result.GetResult<Prisma.$WebhookPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Webhooks.
     * @param {WebhookDeleteManyArgs} args - Arguments to filter Webhooks to delete.
     * @example
     * // Delete a few Webhooks
     * const { count } = await prisma.webhook.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends WebhookDeleteManyArgs>(args?: SelectSubset<T, WebhookDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Webhooks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Webhooks
     * const webhook = await prisma.webhook.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends WebhookUpdateManyArgs>(args: SelectSubset<T, WebhookUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Webhooks and returns the data updated in the database.
     * @param {WebhookUpdateManyAndReturnArgs} args - Arguments to update many Webhooks.
     * @example
     * // Update many Webhooks
     * const webhook = await prisma.webhook.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Webhooks and only return the `id`
     * const webhookWithIdOnly = await prisma.webhook.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends WebhookUpdateManyAndReturnArgs>(args: SelectSubset<T, WebhookUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WebhookPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Webhook.
     * @param {WebhookUpsertArgs} args - Arguments to update or create a Webhook.
     * @example
     * // Update or create a Webhook
     * const webhook = await prisma.webhook.upsert({
     *   create: {
     *     // ... data to create a Webhook
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Webhook we want to update
     *   }
     * })
     */
    upsert<T extends WebhookUpsertArgs>(args: SelectSubset<T, WebhookUpsertArgs<ExtArgs>>): Prisma__WebhookClient<$Result.GetResult<Prisma.$WebhookPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Webhooks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookCountArgs} args - Arguments to filter Webhooks to count.
     * @example
     * // Count the number of Webhooks
     * const count = await prisma.webhook.count({
     *   where: {
     *     // ... the filter for the Webhooks we want to count
     *   }
     * })
    **/
    count<T extends WebhookCountArgs>(
      args?: Subset<T, WebhookCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], WebhookCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Webhook.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends WebhookAggregateArgs>(args: Subset<T, WebhookAggregateArgs>): Prisma.PrismaPromise<GetWebhookAggregateType<T>>

    /**
     * Group by Webhook.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WebhookGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends WebhookGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: WebhookGroupByArgs['orderBy'] }
        : { orderBy?: WebhookGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, WebhookGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWebhookGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Webhook model
   */
  readonly fields: WebhookFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Webhook.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__WebhookClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    agreement<T extends AgreementDefaultArgs<ExtArgs> = {}>(args?: Subset<T, AgreementDefaultArgs<ExtArgs>>): Prisma__AgreementClient<$Result.GetResult<Prisma.$AgreementPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Webhook model
   */
  interface WebhookFieldRefs {
    readonly id: FieldRef<"Webhook", 'String'>
    readonly agreementId: FieldRef<"Webhook", 'String'>
    readonly eventType: FieldRef<"Webhook", 'WebhookEventType'>
    readonly targetUrl: FieldRef<"Webhook", 'String'>
    readonly payload: FieldRef<"Webhook", 'Json'>
    readonly status: FieldRef<"Webhook", 'WebhookDeliveryStatus'>
    readonly attempts: FieldRef<"Webhook", 'Int'>
    readonly maxAttempts: FieldRef<"Webhook", 'Int'>
    readonly lastAttemptAt: FieldRef<"Webhook", 'DateTime'>
    readonly lastResponseCode: FieldRef<"Webhook", 'Int'>
    readonly lastResponseBody: FieldRef<"Webhook", 'String'>
    readonly deliveredAt: FieldRef<"Webhook", 'DateTime'>
    readonly signature: FieldRef<"Webhook", 'String'>
    readonly createdAt: FieldRef<"Webhook", 'DateTime'>
    readonly scheduledFor: FieldRef<"Webhook", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Webhook findUnique
   */
  export type WebhookFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Webhook
     */
    select?: WebhookSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Webhook
     */
    omit?: WebhookOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WebhookInclude<ExtArgs> | null
    /**
     * Filter, which Webhook to fetch.
     */
    where: WebhookWhereUniqueInput
  }

  /**
   * Webhook findUniqueOrThrow
   */
  export type WebhookFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Webhook
     */
    select?: WebhookSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Webhook
     */
    omit?: WebhookOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WebhookInclude<ExtArgs> | null
    /**
     * Filter, which Webhook to fetch.
     */
    where: WebhookWhereUniqueInput
  }

  /**
   * Webhook findFirst
   */
  export type WebhookFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Webhook
     */
    select?: WebhookSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Webhook
     */
    omit?: WebhookOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WebhookInclude<ExtArgs> | null
    /**
     * Filter, which Webhook to fetch.
     */
    where?: WebhookWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Webhooks to fetch.
     */
    orderBy?: WebhookOrderByWithRelationInput | WebhookOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Webhooks.
     */
    cursor?: WebhookWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Webhooks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Webhooks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Webhooks.
     */
    distinct?: WebhookScalarFieldEnum | WebhookScalarFieldEnum[]
  }

  /**
   * Webhook findFirstOrThrow
   */
  export type WebhookFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Webhook
     */
    select?: WebhookSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Webhook
     */
    omit?: WebhookOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WebhookInclude<ExtArgs> | null
    /**
     * Filter, which Webhook to fetch.
     */
    where?: WebhookWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Webhooks to fetch.
     */
    orderBy?: WebhookOrderByWithRelationInput | WebhookOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Webhooks.
     */
    cursor?: WebhookWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Webhooks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Webhooks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Webhooks.
     */
    distinct?: WebhookScalarFieldEnum | WebhookScalarFieldEnum[]
  }

  /**
   * Webhook findMany
   */
  export type WebhookFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Webhook
     */
    select?: WebhookSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Webhook
     */
    omit?: WebhookOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WebhookInclude<ExtArgs> | null
    /**
     * Filter, which Webhooks to fetch.
     */
    where?: WebhookWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Webhooks to fetch.
     */
    orderBy?: WebhookOrderByWithRelationInput | WebhookOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Webhooks.
     */
    cursor?: WebhookWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Webhooks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Webhooks.
     */
    skip?: number
    distinct?: WebhookScalarFieldEnum | WebhookScalarFieldEnum[]
  }

  /**
   * Webhook create
   */
  export type WebhookCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Webhook
     */
    select?: WebhookSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Webhook
     */
    omit?: WebhookOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WebhookInclude<ExtArgs> | null
    /**
     * The data needed to create a Webhook.
     */
    data: XOR<WebhookCreateInput, WebhookUncheckedCreateInput>
  }

  /**
   * Webhook createMany
   */
  export type WebhookCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Webhooks.
     */
    data: WebhookCreateManyInput | WebhookCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Webhook createManyAndReturn
   */
  export type WebhookCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Webhook
     */
    select?: WebhookSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Webhook
     */
    omit?: WebhookOmit<ExtArgs> | null
    /**
     * The data used to create many Webhooks.
     */
    data: WebhookCreateManyInput | WebhookCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WebhookIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Webhook update
   */
  export type WebhookUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Webhook
     */
    select?: WebhookSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Webhook
     */
    omit?: WebhookOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WebhookInclude<ExtArgs> | null
    /**
     * The data needed to update a Webhook.
     */
    data: XOR<WebhookUpdateInput, WebhookUncheckedUpdateInput>
    /**
     * Choose, which Webhook to update.
     */
    where: WebhookWhereUniqueInput
  }

  /**
   * Webhook updateMany
   */
  export type WebhookUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Webhooks.
     */
    data: XOR<WebhookUpdateManyMutationInput, WebhookUncheckedUpdateManyInput>
    /**
     * Filter which Webhooks to update
     */
    where?: WebhookWhereInput
    /**
     * Limit how many Webhooks to update.
     */
    limit?: number
  }

  /**
   * Webhook updateManyAndReturn
   */
  export type WebhookUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Webhook
     */
    select?: WebhookSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Webhook
     */
    omit?: WebhookOmit<ExtArgs> | null
    /**
     * The data used to update Webhooks.
     */
    data: XOR<WebhookUpdateManyMutationInput, WebhookUncheckedUpdateManyInput>
    /**
     * Filter which Webhooks to update
     */
    where?: WebhookWhereInput
    /**
     * Limit how many Webhooks to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WebhookIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Webhook upsert
   */
  export type WebhookUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Webhook
     */
    select?: WebhookSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Webhook
     */
    omit?: WebhookOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WebhookInclude<ExtArgs> | null
    /**
     * The filter to search for the Webhook to update in case it exists.
     */
    where: WebhookWhereUniqueInput
    /**
     * In case the Webhook found by the `where` argument doesn't exist, create a new Webhook with this data.
     */
    create: XOR<WebhookCreateInput, WebhookUncheckedCreateInput>
    /**
     * In case the Webhook was found with the provided `where` argument, update it with this data.
     */
    update: XOR<WebhookUpdateInput, WebhookUncheckedUpdateInput>
  }

  /**
   * Webhook delete
   */
  export type WebhookDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Webhook
     */
    select?: WebhookSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Webhook
     */
    omit?: WebhookOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WebhookInclude<ExtArgs> | null
    /**
     * Filter which Webhook to delete.
     */
    where: WebhookWhereUniqueInput
  }

  /**
   * Webhook deleteMany
   */
  export type WebhookDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Webhooks to delete
     */
    where?: WebhookWhereInput
    /**
     * Limit how many Webhooks to delete.
     */
    limit?: number
  }

  /**
   * Webhook without action
   */
  export type WebhookDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Webhook
     */
    select?: WebhookSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Webhook
     */
    omit?: WebhookOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WebhookInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const AgreementScalarFieldEnum: {
    id: 'id',
    agreementId: 'agreementId',
    escrowPda: 'escrowPda',
    nftMint: 'nftMint',
    seller: 'seller',
    buyer: 'buyer',
    price: 'price',
    feeBps: 'feeBps',
    honorRoyalties: 'honorRoyalties',
    status: 'status',
    expiry: 'expiry',
    usdcDepositAddr: 'usdcDepositAddr',
    nftDepositAddr: 'nftDepositAddr',
    initTxId: 'initTxId',
    settleTxId: 'settleTxId',
    cancelTxId: 'cancelTxId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    settledAt: 'settledAt',
    cancelledAt: 'cancelledAt'
  };

  export type AgreementScalarFieldEnum = (typeof AgreementScalarFieldEnum)[keyof typeof AgreementScalarFieldEnum]


  export const DepositScalarFieldEnum: {
    id: 'id',
    agreementId: 'agreementId',
    type: 'type',
    depositor: 'depositor',
    amount: 'amount',
    tokenAccount: 'tokenAccount',
    status: 'status',
    txId: 'txId',
    blockHeight: 'blockHeight',
    nftMetadata: 'nftMetadata',
    detectedAt: 'detectedAt',
    confirmedAt: 'confirmedAt'
  };

  export type DepositScalarFieldEnum = (typeof DepositScalarFieldEnum)[keyof typeof DepositScalarFieldEnum]


  export const IdempotencyKeyScalarFieldEnum: {
    id: 'id',
    key: 'key',
    endpoint: 'endpoint',
    requestHash: 'requestHash',
    responseStatus: 'responseStatus',
    responseBody: 'responseBody',
    createdAt: 'createdAt',
    expiresAt: 'expiresAt'
  };

  export type IdempotencyKeyScalarFieldEnum = (typeof IdempotencyKeyScalarFieldEnum)[keyof typeof IdempotencyKeyScalarFieldEnum]


  export const SettlementScalarFieldEnum: {
    id: 'id',
    agreementId: 'agreementId',
    nftMint: 'nftMint',
    price: 'price',
    platformFee: 'platformFee',
    creatorRoyalty: 'creatorRoyalty',
    sellerReceived: 'sellerReceived',
    settleTxId: 'settleTxId',
    blockHeight: 'blockHeight',
    buyer: 'buyer',
    seller: 'seller',
    feeCollector: 'feeCollector',
    royaltyRecipient: 'royaltyRecipient',
    settledAt: 'settledAt'
  };

  export type SettlementScalarFieldEnum = (typeof SettlementScalarFieldEnum)[keyof typeof SettlementScalarFieldEnum]


  export const ReceiptScalarFieldEnum: {
    id: 'id',
    agreementId: 'agreementId',
    nftMint: 'nftMint',
    price: 'price',
    platformFee: 'platformFee',
    creatorRoyalty: 'creatorRoyalty',
    buyer: 'buyer',
    seller: 'seller',
    escrowTxId: 'escrowTxId',
    settlementTxId: 'settlementTxId',
    receiptHash: 'receiptHash',
    signature: 'signature',
    createdAt: 'createdAt',
    settledAt: 'settledAt',
    generatedAt: 'generatedAt'
  };

  export type ReceiptScalarFieldEnum = (typeof ReceiptScalarFieldEnum)[keyof typeof ReceiptScalarFieldEnum]


  export const TransactionLogScalarFieldEnum: {
    id: 'id',
    agreementId: 'agreementId',
    txId: 'txId',
    operationType: 'operationType',
    blockHeight: 'blockHeight',
    slot: 'slot',
    status: 'status',
    errorMessage: 'errorMessage',
    timestamp: 'timestamp'
  };

  export type TransactionLogScalarFieldEnum = (typeof TransactionLogScalarFieldEnum)[keyof typeof TransactionLogScalarFieldEnum]


  export const WebhookScalarFieldEnum: {
    id: 'id',
    agreementId: 'agreementId',
    eventType: 'eventType',
    targetUrl: 'targetUrl',
    payload: 'payload',
    status: 'status',
    attempts: 'attempts',
    maxAttempts: 'maxAttempts',
    lastAttemptAt: 'lastAttemptAt',
    lastResponseCode: 'lastResponseCode',
    lastResponseBody: 'lastResponseBody',
    deliveredAt: 'deliveredAt',
    signature: 'signature',
    createdAt: 'createdAt',
    scheduledFor: 'scheduledFor'
  };

  export type WebhookScalarFieldEnum = (typeof WebhookScalarFieldEnum)[keyof typeof WebhookScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Decimal'
   */
  export type DecimalFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Decimal'>
    


  /**
   * Reference to a field of type 'Decimal[]'
   */
  export type ListDecimalFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Decimal[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'AgreementStatus'
   */
  export type EnumAgreementStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'AgreementStatus'>
    


  /**
   * Reference to a field of type 'AgreementStatus[]'
   */
  export type ListEnumAgreementStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'AgreementStatus[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'DepositType'
   */
  export type EnumDepositTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DepositType'>
    


  /**
   * Reference to a field of type 'DepositType[]'
   */
  export type ListEnumDepositTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DepositType[]'>
    


  /**
   * Reference to a field of type 'DepositStatus'
   */
  export type EnumDepositStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DepositStatus'>
    


  /**
   * Reference to a field of type 'DepositStatus[]'
   */
  export type ListEnumDepositStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DepositStatus[]'>
    


  /**
   * Reference to a field of type 'BigInt'
   */
  export type BigIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'BigInt'>
    


  /**
   * Reference to a field of type 'BigInt[]'
   */
  export type ListBigIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'BigInt[]'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'QueryMode'
   */
  export type EnumQueryModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'QueryMode'>
    


  /**
   * Reference to a field of type 'WebhookEventType'
   */
  export type EnumWebhookEventTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'WebhookEventType'>
    


  /**
   * Reference to a field of type 'WebhookEventType[]'
   */
  export type ListEnumWebhookEventTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'WebhookEventType[]'>
    


  /**
   * Reference to a field of type 'WebhookDeliveryStatus'
   */
  export type EnumWebhookDeliveryStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'WebhookDeliveryStatus'>
    


  /**
   * Reference to a field of type 'WebhookDeliveryStatus[]'
   */
  export type ListEnumWebhookDeliveryStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'WebhookDeliveryStatus[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type AgreementWhereInput = {
    AND?: AgreementWhereInput | AgreementWhereInput[]
    OR?: AgreementWhereInput[]
    NOT?: AgreementWhereInput | AgreementWhereInput[]
    id?: StringFilter<"Agreement"> | string
    agreementId?: StringFilter<"Agreement"> | string
    escrowPda?: StringFilter<"Agreement"> | string
    nftMint?: StringFilter<"Agreement"> | string
    seller?: StringFilter<"Agreement"> | string
    buyer?: StringNullableFilter<"Agreement"> | string | null
    price?: DecimalFilter<"Agreement"> | Decimal | DecimalJsLike | number | string
    feeBps?: IntFilter<"Agreement"> | number
    honorRoyalties?: BoolFilter<"Agreement"> | boolean
    status?: EnumAgreementStatusFilter<"Agreement"> | $Enums.AgreementStatus
    expiry?: DateTimeFilter<"Agreement"> | Date | string
    usdcDepositAddr?: StringNullableFilter<"Agreement"> | string | null
    nftDepositAddr?: StringNullableFilter<"Agreement"> | string | null
    initTxId?: StringNullableFilter<"Agreement"> | string | null
    settleTxId?: StringNullableFilter<"Agreement"> | string | null
    cancelTxId?: StringNullableFilter<"Agreement"> | string | null
    createdAt?: DateTimeFilter<"Agreement"> | Date | string
    updatedAt?: DateTimeFilter<"Agreement"> | Date | string
    settledAt?: DateTimeNullableFilter<"Agreement"> | Date | string | null
    cancelledAt?: DateTimeNullableFilter<"Agreement"> | Date | string | null
    deposits?: DepositListRelationFilter
    settlement?: XOR<SettlementNullableScalarRelationFilter, SettlementWhereInput> | null
    receipt?: XOR<ReceiptNullableScalarRelationFilter, ReceiptWhereInput> | null
    webhooks?: WebhookListRelationFilter
  }

  export type AgreementOrderByWithRelationInput = {
    id?: SortOrder
    agreementId?: SortOrder
    escrowPda?: SortOrder
    nftMint?: SortOrder
    seller?: SortOrder
    buyer?: SortOrderInput | SortOrder
    price?: SortOrder
    feeBps?: SortOrder
    honorRoyalties?: SortOrder
    status?: SortOrder
    expiry?: SortOrder
    usdcDepositAddr?: SortOrderInput | SortOrder
    nftDepositAddr?: SortOrderInput | SortOrder
    initTxId?: SortOrderInput | SortOrder
    settleTxId?: SortOrderInput | SortOrder
    cancelTxId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    settledAt?: SortOrderInput | SortOrder
    cancelledAt?: SortOrderInput | SortOrder
    deposits?: DepositOrderByRelationAggregateInput
    settlement?: SettlementOrderByWithRelationInput
    receipt?: ReceiptOrderByWithRelationInput
    webhooks?: WebhookOrderByRelationAggregateInput
  }

  export type AgreementWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    agreementId?: string
    AND?: AgreementWhereInput | AgreementWhereInput[]
    OR?: AgreementWhereInput[]
    NOT?: AgreementWhereInput | AgreementWhereInput[]
    escrowPda?: StringFilter<"Agreement"> | string
    nftMint?: StringFilter<"Agreement"> | string
    seller?: StringFilter<"Agreement"> | string
    buyer?: StringNullableFilter<"Agreement"> | string | null
    price?: DecimalFilter<"Agreement"> | Decimal | DecimalJsLike | number | string
    feeBps?: IntFilter<"Agreement"> | number
    honorRoyalties?: BoolFilter<"Agreement"> | boolean
    status?: EnumAgreementStatusFilter<"Agreement"> | $Enums.AgreementStatus
    expiry?: DateTimeFilter<"Agreement"> | Date | string
    usdcDepositAddr?: StringNullableFilter<"Agreement"> | string | null
    nftDepositAddr?: StringNullableFilter<"Agreement"> | string | null
    initTxId?: StringNullableFilter<"Agreement"> | string | null
    settleTxId?: StringNullableFilter<"Agreement"> | string | null
    cancelTxId?: StringNullableFilter<"Agreement"> | string | null
    createdAt?: DateTimeFilter<"Agreement"> | Date | string
    updatedAt?: DateTimeFilter<"Agreement"> | Date | string
    settledAt?: DateTimeNullableFilter<"Agreement"> | Date | string | null
    cancelledAt?: DateTimeNullableFilter<"Agreement"> | Date | string | null
    deposits?: DepositListRelationFilter
    settlement?: XOR<SettlementNullableScalarRelationFilter, SettlementWhereInput> | null
    receipt?: XOR<ReceiptNullableScalarRelationFilter, ReceiptWhereInput> | null
    webhooks?: WebhookListRelationFilter
  }, "id" | "agreementId">

  export type AgreementOrderByWithAggregationInput = {
    id?: SortOrder
    agreementId?: SortOrder
    escrowPda?: SortOrder
    nftMint?: SortOrder
    seller?: SortOrder
    buyer?: SortOrderInput | SortOrder
    price?: SortOrder
    feeBps?: SortOrder
    honorRoyalties?: SortOrder
    status?: SortOrder
    expiry?: SortOrder
    usdcDepositAddr?: SortOrderInput | SortOrder
    nftDepositAddr?: SortOrderInput | SortOrder
    initTxId?: SortOrderInput | SortOrder
    settleTxId?: SortOrderInput | SortOrder
    cancelTxId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    settledAt?: SortOrderInput | SortOrder
    cancelledAt?: SortOrderInput | SortOrder
    _count?: AgreementCountOrderByAggregateInput
    _avg?: AgreementAvgOrderByAggregateInput
    _max?: AgreementMaxOrderByAggregateInput
    _min?: AgreementMinOrderByAggregateInput
    _sum?: AgreementSumOrderByAggregateInput
  }

  export type AgreementScalarWhereWithAggregatesInput = {
    AND?: AgreementScalarWhereWithAggregatesInput | AgreementScalarWhereWithAggregatesInput[]
    OR?: AgreementScalarWhereWithAggregatesInput[]
    NOT?: AgreementScalarWhereWithAggregatesInput | AgreementScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Agreement"> | string
    agreementId?: StringWithAggregatesFilter<"Agreement"> | string
    escrowPda?: StringWithAggregatesFilter<"Agreement"> | string
    nftMint?: StringWithAggregatesFilter<"Agreement"> | string
    seller?: StringWithAggregatesFilter<"Agreement"> | string
    buyer?: StringNullableWithAggregatesFilter<"Agreement"> | string | null
    price?: DecimalWithAggregatesFilter<"Agreement"> | Decimal | DecimalJsLike | number | string
    feeBps?: IntWithAggregatesFilter<"Agreement"> | number
    honorRoyalties?: BoolWithAggregatesFilter<"Agreement"> | boolean
    status?: EnumAgreementStatusWithAggregatesFilter<"Agreement"> | $Enums.AgreementStatus
    expiry?: DateTimeWithAggregatesFilter<"Agreement"> | Date | string
    usdcDepositAddr?: StringNullableWithAggregatesFilter<"Agreement"> | string | null
    nftDepositAddr?: StringNullableWithAggregatesFilter<"Agreement"> | string | null
    initTxId?: StringNullableWithAggregatesFilter<"Agreement"> | string | null
    settleTxId?: StringNullableWithAggregatesFilter<"Agreement"> | string | null
    cancelTxId?: StringNullableWithAggregatesFilter<"Agreement"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Agreement"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Agreement"> | Date | string
    settledAt?: DateTimeNullableWithAggregatesFilter<"Agreement"> | Date | string | null
    cancelledAt?: DateTimeNullableWithAggregatesFilter<"Agreement"> | Date | string | null
  }

  export type DepositWhereInput = {
    AND?: DepositWhereInput | DepositWhereInput[]
    OR?: DepositWhereInput[]
    NOT?: DepositWhereInput | DepositWhereInput[]
    id?: StringFilter<"Deposit"> | string
    agreementId?: StringFilter<"Deposit"> | string
    type?: EnumDepositTypeFilter<"Deposit"> | $Enums.DepositType
    depositor?: StringFilter<"Deposit"> | string
    amount?: DecimalNullableFilter<"Deposit"> | Decimal | DecimalJsLike | number | string | null
    tokenAccount?: StringNullableFilter<"Deposit"> | string | null
    status?: EnumDepositStatusFilter<"Deposit"> | $Enums.DepositStatus
    txId?: StringNullableFilter<"Deposit"> | string | null
    blockHeight?: BigIntNullableFilter<"Deposit"> | bigint | number | null
    nftMetadata?: JsonNullableFilter<"Deposit">
    detectedAt?: DateTimeFilter<"Deposit"> | Date | string
    confirmedAt?: DateTimeNullableFilter<"Deposit"> | Date | string | null
    agreement?: XOR<AgreementScalarRelationFilter, AgreementWhereInput>
  }

  export type DepositOrderByWithRelationInput = {
    id?: SortOrder
    agreementId?: SortOrder
    type?: SortOrder
    depositor?: SortOrder
    amount?: SortOrderInput | SortOrder
    tokenAccount?: SortOrderInput | SortOrder
    status?: SortOrder
    txId?: SortOrderInput | SortOrder
    blockHeight?: SortOrderInput | SortOrder
    nftMetadata?: SortOrderInput | SortOrder
    detectedAt?: SortOrder
    confirmedAt?: SortOrderInput | SortOrder
    agreement?: AgreementOrderByWithRelationInput
  }

  export type DepositWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: DepositWhereInput | DepositWhereInput[]
    OR?: DepositWhereInput[]
    NOT?: DepositWhereInput | DepositWhereInput[]
    agreementId?: StringFilter<"Deposit"> | string
    type?: EnumDepositTypeFilter<"Deposit"> | $Enums.DepositType
    depositor?: StringFilter<"Deposit"> | string
    amount?: DecimalNullableFilter<"Deposit"> | Decimal | DecimalJsLike | number | string | null
    tokenAccount?: StringNullableFilter<"Deposit"> | string | null
    status?: EnumDepositStatusFilter<"Deposit"> | $Enums.DepositStatus
    txId?: StringNullableFilter<"Deposit"> | string | null
    blockHeight?: BigIntNullableFilter<"Deposit"> | bigint | number | null
    nftMetadata?: JsonNullableFilter<"Deposit">
    detectedAt?: DateTimeFilter<"Deposit"> | Date | string
    confirmedAt?: DateTimeNullableFilter<"Deposit"> | Date | string | null
    agreement?: XOR<AgreementScalarRelationFilter, AgreementWhereInput>
  }, "id">

  export type DepositOrderByWithAggregationInput = {
    id?: SortOrder
    agreementId?: SortOrder
    type?: SortOrder
    depositor?: SortOrder
    amount?: SortOrderInput | SortOrder
    tokenAccount?: SortOrderInput | SortOrder
    status?: SortOrder
    txId?: SortOrderInput | SortOrder
    blockHeight?: SortOrderInput | SortOrder
    nftMetadata?: SortOrderInput | SortOrder
    detectedAt?: SortOrder
    confirmedAt?: SortOrderInput | SortOrder
    _count?: DepositCountOrderByAggregateInput
    _avg?: DepositAvgOrderByAggregateInput
    _max?: DepositMaxOrderByAggregateInput
    _min?: DepositMinOrderByAggregateInput
    _sum?: DepositSumOrderByAggregateInput
  }

  export type DepositScalarWhereWithAggregatesInput = {
    AND?: DepositScalarWhereWithAggregatesInput | DepositScalarWhereWithAggregatesInput[]
    OR?: DepositScalarWhereWithAggregatesInput[]
    NOT?: DepositScalarWhereWithAggregatesInput | DepositScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Deposit"> | string
    agreementId?: StringWithAggregatesFilter<"Deposit"> | string
    type?: EnumDepositTypeWithAggregatesFilter<"Deposit"> | $Enums.DepositType
    depositor?: StringWithAggregatesFilter<"Deposit"> | string
    amount?: DecimalNullableWithAggregatesFilter<"Deposit"> | Decimal | DecimalJsLike | number | string | null
    tokenAccount?: StringNullableWithAggregatesFilter<"Deposit"> | string | null
    status?: EnumDepositStatusWithAggregatesFilter<"Deposit"> | $Enums.DepositStatus
    txId?: StringNullableWithAggregatesFilter<"Deposit"> | string | null
    blockHeight?: BigIntNullableWithAggregatesFilter<"Deposit"> | bigint | number | null
    nftMetadata?: JsonNullableWithAggregatesFilter<"Deposit">
    detectedAt?: DateTimeWithAggregatesFilter<"Deposit"> | Date | string
    confirmedAt?: DateTimeNullableWithAggregatesFilter<"Deposit"> | Date | string | null
  }

  export type IdempotencyKeyWhereInput = {
    AND?: IdempotencyKeyWhereInput | IdempotencyKeyWhereInput[]
    OR?: IdempotencyKeyWhereInput[]
    NOT?: IdempotencyKeyWhereInput | IdempotencyKeyWhereInput[]
    id?: StringFilter<"IdempotencyKey"> | string
    key?: StringFilter<"IdempotencyKey"> | string
    endpoint?: StringFilter<"IdempotencyKey"> | string
    requestHash?: StringFilter<"IdempotencyKey"> | string
    responseStatus?: IntFilter<"IdempotencyKey"> | number
    responseBody?: JsonFilter<"IdempotencyKey">
    createdAt?: DateTimeFilter<"IdempotencyKey"> | Date | string
    expiresAt?: DateTimeFilter<"IdempotencyKey"> | Date | string
  }

  export type IdempotencyKeyOrderByWithRelationInput = {
    id?: SortOrder
    key?: SortOrder
    endpoint?: SortOrder
    requestHash?: SortOrder
    responseStatus?: SortOrder
    responseBody?: SortOrder
    createdAt?: SortOrder
    expiresAt?: SortOrder
  }

  export type IdempotencyKeyWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    key?: string
    AND?: IdempotencyKeyWhereInput | IdempotencyKeyWhereInput[]
    OR?: IdempotencyKeyWhereInput[]
    NOT?: IdempotencyKeyWhereInput | IdempotencyKeyWhereInput[]
    endpoint?: StringFilter<"IdempotencyKey"> | string
    requestHash?: StringFilter<"IdempotencyKey"> | string
    responseStatus?: IntFilter<"IdempotencyKey"> | number
    responseBody?: JsonFilter<"IdempotencyKey">
    createdAt?: DateTimeFilter<"IdempotencyKey"> | Date | string
    expiresAt?: DateTimeFilter<"IdempotencyKey"> | Date | string
  }, "id" | "key">

  export type IdempotencyKeyOrderByWithAggregationInput = {
    id?: SortOrder
    key?: SortOrder
    endpoint?: SortOrder
    requestHash?: SortOrder
    responseStatus?: SortOrder
    responseBody?: SortOrder
    createdAt?: SortOrder
    expiresAt?: SortOrder
    _count?: IdempotencyKeyCountOrderByAggregateInput
    _avg?: IdempotencyKeyAvgOrderByAggregateInput
    _max?: IdempotencyKeyMaxOrderByAggregateInput
    _min?: IdempotencyKeyMinOrderByAggregateInput
    _sum?: IdempotencyKeySumOrderByAggregateInput
  }

  export type IdempotencyKeyScalarWhereWithAggregatesInput = {
    AND?: IdempotencyKeyScalarWhereWithAggregatesInput | IdempotencyKeyScalarWhereWithAggregatesInput[]
    OR?: IdempotencyKeyScalarWhereWithAggregatesInput[]
    NOT?: IdempotencyKeyScalarWhereWithAggregatesInput | IdempotencyKeyScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"IdempotencyKey"> | string
    key?: StringWithAggregatesFilter<"IdempotencyKey"> | string
    endpoint?: StringWithAggregatesFilter<"IdempotencyKey"> | string
    requestHash?: StringWithAggregatesFilter<"IdempotencyKey"> | string
    responseStatus?: IntWithAggregatesFilter<"IdempotencyKey"> | number
    responseBody?: JsonWithAggregatesFilter<"IdempotencyKey">
    createdAt?: DateTimeWithAggregatesFilter<"IdempotencyKey"> | Date | string
    expiresAt?: DateTimeWithAggregatesFilter<"IdempotencyKey"> | Date | string
  }

  export type SettlementWhereInput = {
    AND?: SettlementWhereInput | SettlementWhereInput[]
    OR?: SettlementWhereInput[]
    NOT?: SettlementWhereInput | SettlementWhereInput[]
    id?: StringFilter<"Settlement"> | string
    agreementId?: StringFilter<"Settlement"> | string
    nftMint?: StringFilter<"Settlement"> | string
    price?: DecimalFilter<"Settlement"> | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFilter<"Settlement"> | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: DecimalNullableFilter<"Settlement"> | Decimal | DecimalJsLike | number | string | null
    sellerReceived?: DecimalFilter<"Settlement"> | Decimal | DecimalJsLike | number | string
    settleTxId?: StringFilter<"Settlement"> | string
    blockHeight?: BigIntFilter<"Settlement"> | bigint | number
    buyer?: StringFilter<"Settlement"> | string
    seller?: StringFilter<"Settlement"> | string
    feeCollector?: StringNullableFilter<"Settlement"> | string | null
    royaltyRecipient?: StringNullableFilter<"Settlement"> | string | null
    settledAt?: DateTimeFilter<"Settlement"> | Date | string
    agreement?: XOR<AgreementScalarRelationFilter, AgreementWhereInput>
  }

  export type SettlementOrderByWithRelationInput = {
    id?: SortOrder
    agreementId?: SortOrder
    nftMint?: SortOrder
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrderInput | SortOrder
    sellerReceived?: SortOrder
    settleTxId?: SortOrder
    blockHeight?: SortOrder
    buyer?: SortOrder
    seller?: SortOrder
    feeCollector?: SortOrderInput | SortOrder
    royaltyRecipient?: SortOrderInput | SortOrder
    settledAt?: SortOrder
    agreement?: AgreementOrderByWithRelationInput
  }

  export type SettlementWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    agreementId?: string
    AND?: SettlementWhereInput | SettlementWhereInput[]
    OR?: SettlementWhereInput[]
    NOT?: SettlementWhereInput | SettlementWhereInput[]
    nftMint?: StringFilter<"Settlement"> | string
    price?: DecimalFilter<"Settlement"> | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFilter<"Settlement"> | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: DecimalNullableFilter<"Settlement"> | Decimal | DecimalJsLike | number | string | null
    sellerReceived?: DecimalFilter<"Settlement"> | Decimal | DecimalJsLike | number | string
    settleTxId?: StringFilter<"Settlement"> | string
    blockHeight?: BigIntFilter<"Settlement"> | bigint | number
    buyer?: StringFilter<"Settlement"> | string
    seller?: StringFilter<"Settlement"> | string
    feeCollector?: StringNullableFilter<"Settlement"> | string | null
    royaltyRecipient?: StringNullableFilter<"Settlement"> | string | null
    settledAt?: DateTimeFilter<"Settlement"> | Date | string
    agreement?: XOR<AgreementScalarRelationFilter, AgreementWhereInput>
  }, "id" | "agreementId">

  export type SettlementOrderByWithAggregationInput = {
    id?: SortOrder
    agreementId?: SortOrder
    nftMint?: SortOrder
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrderInput | SortOrder
    sellerReceived?: SortOrder
    settleTxId?: SortOrder
    blockHeight?: SortOrder
    buyer?: SortOrder
    seller?: SortOrder
    feeCollector?: SortOrderInput | SortOrder
    royaltyRecipient?: SortOrderInput | SortOrder
    settledAt?: SortOrder
    _count?: SettlementCountOrderByAggregateInput
    _avg?: SettlementAvgOrderByAggregateInput
    _max?: SettlementMaxOrderByAggregateInput
    _min?: SettlementMinOrderByAggregateInput
    _sum?: SettlementSumOrderByAggregateInput
  }

  export type SettlementScalarWhereWithAggregatesInput = {
    AND?: SettlementScalarWhereWithAggregatesInput | SettlementScalarWhereWithAggregatesInput[]
    OR?: SettlementScalarWhereWithAggregatesInput[]
    NOT?: SettlementScalarWhereWithAggregatesInput | SettlementScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Settlement"> | string
    agreementId?: StringWithAggregatesFilter<"Settlement"> | string
    nftMint?: StringWithAggregatesFilter<"Settlement"> | string
    price?: DecimalWithAggregatesFilter<"Settlement"> | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalWithAggregatesFilter<"Settlement"> | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: DecimalNullableWithAggregatesFilter<"Settlement"> | Decimal | DecimalJsLike | number | string | null
    sellerReceived?: DecimalWithAggregatesFilter<"Settlement"> | Decimal | DecimalJsLike | number | string
    settleTxId?: StringWithAggregatesFilter<"Settlement"> | string
    blockHeight?: BigIntWithAggregatesFilter<"Settlement"> | bigint | number
    buyer?: StringWithAggregatesFilter<"Settlement"> | string
    seller?: StringWithAggregatesFilter<"Settlement"> | string
    feeCollector?: StringNullableWithAggregatesFilter<"Settlement"> | string | null
    royaltyRecipient?: StringNullableWithAggregatesFilter<"Settlement"> | string | null
    settledAt?: DateTimeWithAggregatesFilter<"Settlement"> | Date | string
  }

  export type ReceiptWhereInput = {
    AND?: ReceiptWhereInput | ReceiptWhereInput[]
    OR?: ReceiptWhereInput[]
    NOT?: ReceiptWhereInput | ReceiptWhereInput[]
    id?: StringFilter<"Receipt"> | string
    agreementId?: StringFilter<"Receipt"> | string
    nftMint?: StringFilter<"Receipt"> | string
    price?: DecimalFilter<"Receipt"> | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFilter<"Receipt"> | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: DecimalNullableFilter<"Receipt"> | Decimal | DecimalJsLike | number | string | null
    buyer?: StringFilter<"Receipt"> | string
    seller?: StringFilter<"Receipt"> | string
    escrowTxId?: StringFilter<"Receipt"> | string
    settlementTxId?: StringFilter<"Receipt"> | string
    receiptHash?: StringFilter<"Receipt"> | string
    signature?: StringFilter<"Receipt"> | string
    createdAt?: DateTimeFilter<"Receipt"> | Date | string
    settledAt?: DateTimeFilter<"Receipt"> | Date | string
    generatedAt?: DateTimeFilter<"Receipt"> | Date | string
    agreement?: XOR<AgreementScalarRelationFilter, AgreementWhereInput>
  }

  export type ReceiptOrderByWithRelationInput = {
    id?: SortOrder
    agreementId?: SortOrder
    nftMint?: SortOrder
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrderInput | SortOrder
    buyer?: SortOrder
    seller?: SortOrder
    escrowTxId?: SortOrder
    settlementTxId?: SortOrder
    receiptHash?: SortOrder
    signature?: SortOrder
    createdAt?: SortOrder
    settledAt?: SortOrder
    generatedAt?: SortOrder
    agreement?: AgreementOrderByWithRelationInput
  }

  export type ReceiptWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    agreementId?: string
    receiptHash?: string
    AND?: ReceiptWhereInput | ReceiptWhereInput[]
    OR?: ReceiptWhereInput[]
    NOT?: ReceiptWhereInput | ReceiptWhereInput[]
    nftMint?: StringFilter<"Receipt"> | string
    price?: DecimalFilter<"Receipt"> | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFilter<"Receipt"> | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: DecimalNullableFilter<"Receipt"> | Decimal | DecimalJsLike | number | string | null
    buyer?: StringFilter<"Receipt"> | string
    seller?: StringFilter<"Receipt"> | string
    escrowTxId?: StringFilter<"Receipt"> | string
    settlementTxId?: StringFilter<"Receipt"> | string
    signature?: StringFilter<"Receipt"> | string
    createdAt?: DateTimeFilter<"Receipt"> | Date | string
    settledAt?: DateTimeFilter<"Receipt"> | Date | string
    generatedAt?: DateTimeFilter<"Receipt"> | Date | string
    agreement?: XOR<AgreementScalarRelationFilter, AgreementWhereInput>
  }, "id" | "agreementId" | "receiptHash">

  export type ReceiptOrderByWithAggregationInput = {
    id?: SortOrder
    agreementId?: SortOrder
    nftMint?: SortOrder
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrderInput | SortOrder
    buyer?: SortOrder
    seller?: SortOrder
    escrowTxId?: SortOrder
    settlementTxId?: SortOrder
    receiptHash?: SortOrder
    signature?: SortOrder
    createdAt?: SortOrder
    settledAt?: SortOrder
    generatedAt?: SortOrder
    _count?: ReceiptCountOrderByAggregateInput
    _avg?: ReceiptAvgOrderByAggregateInput
    _max?: ReceiptMaxOrderByAggregateInput
    _min?: ReceiptMinOrderByAggregateInput
    _sum?: ReceiptSumOrderByAggregateInput
  }

  export type ReceiptScalarWhereWithAggregatesInput = {
    AND?: ReceiptScalarWhereWithAggregatesInput | ReceiptScalarWhereWithAggregatesInput[]
    OR?: ReceiptScalarWhereWithAggregatesInput[]
    NOT?: ReceiptScalarWhereWithAggregatesInput | ReceiptScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Receipt"> | string
    agreementId?: StringWithAggregatesFilter<"Receipt"> | string
    nftMint?: StringWithAggregatesFilter<"Receipt"> | string
    price?: DecimalWithAggregatesFilter<"Receipt"> | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalWithAggregatesFilter<"Receipt"> | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: DecimalNullableWithAggregatesFilter<"Receipt"> | Decimal | DecimalJsLike | number | string | null
    buyer?: StringWithAggregatesFilter<"Receipt"> | string
    seller?: StringWithAggregatesFilter<"Receipt"> | string
    escrowTxId?: StringWithAggregatesFilter<"Receipt"> | string
    settlementTxId?: StringWithAggregatesFilter<"Receipt"> | string
    receiptHash?: StringWithAggregatesFilter<"Receipt"> | string
    signature?: StringWithAggregatesFilter<"Receipt"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Receipt"> | Date | string
    settledAt?: DateTimeWithAggregatesFilter<"Receipt"> | Date | string
    generatedAt?: DateTimeWithAggregatesFilter<"Receipt"> | Date | string
  }

  export type TransactionLogWhereInput = {
    AND?: TransactionLogWhereInput | TransactionLogWhereInput[]
    OR?: TransactionLogWhereInput[]
    NOT?: TransactionLogWhereInput | TransactionLogWhereInput[]
    id?: StringFilter<"TransactionLog"> | string
    agreementId?: StringNullableFilter<"TransactionLog"> | string | null
    txId?: StringFilter<"TransactionLog"> | string
    operationType?: StringFilter<"TransactionLog"> | string
    blockHeight?: BigIntNullableFilter<"TransactionLog"> | bigint | number | null
    slot?: BigIntNullableFilter<"TransactionLog"> | bigint | number | null
    status?: StringFilter<"TransactionLog"> | string
    errorMessage?: StringNullableFilter<"TransactionLog"> | string | null
    timestamp?: DateTimeFilter<"TransactionLog"> | Date | string
  }

  export type TransactionLogOrderByWithRelationInput = {
    id?: SortOrder
    agreementId?: SortOrderInput | SortOrder
    txId?: SortOrder
    operationType?: SortOrder
    blockHeight?: SortOrderInput | SortOrder
    slot?: SortOrderInput | SortOrder
    status?: SortOrder
    errorMessage?: SortOrderInput | SortOrder
    timestamp?: SortOrder
  }

  export type TransactionLogWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    txId?: string
    AND?: TransactionLogWhereInput | TransactionLogWhereInput[]
    OR?: TransactionLogWhereInput[]
    NOT?: TransactionLogWhereInput | TransactionLogWhereInput[]
    agreementId?: StringNullableFilter<"TransactionLog"> | string | null
    operationType?: StringFilter<"TransactionLog"> | string
    blockHeight?: BigIntNullableFilter<"TransactionLog"> | bigint | number | null
    slot?: BigIntNullableFilter<"TransactionLog"> | bigint | number | null
    status?: StringFilter<"TransactionLog"> | string
    errorMessage?: StringNullableFilter<"TransactionLog"> | string | null
    timestamp?: DateTimeFilter<"TransactionLog"> | Date | string
  }, "id" | "txId">

  export type TransactionLogOrderByWithAggregationInput = {
    id?: SortOrder
    agreementId?: SortOrderInput | SortOrder
    txId?: SortOrder
    operationType?: SortOrder
    blockHeight?: SortOrderInput | SortOrder
    slot?: SortOrderInput | SortOrder
    status?: SortOrder
    errorMessage?: SortOrderInput | SortOrder
    timestamp?: SortOrder
    _count?: TransactionLogCountOrderByAggregateInput
    _avg?: TransactionLogAvgOrderByAggregateInput
    _max?: TransactionLogMaxOrderByAggregateInput
    _min?: TransactionLogMinOrderByAggregateInput
    _sum?: TransactionLogSumOrderByAggregateInput
  }

  export type TransactionLogScalarWhereWithAggregatesInput = {
    AND?: TransactionLogScalarWhereWithAggregatesInput | TransactionLogScalarWhereWithAggregatesInput[]
    OR?: TransactionLogScalarWhereWithAggregatesInput[]
    NOT?: TransactionLogScalarWhereWithAggregatesInput | TransactionLogScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"TransactionLog"> | string
    agreementId?: StringNullableWithAggregatesFilter<"TransactionLog"> | string | null
    txId?: StringWithAggregatesFilter<"TransactionLog"> | string
    operationType?: StringWithAggregatesFilter<"TransactionLog"> | string
    blockHeight?: BigIntNullableWithAggregatesFilter<"TransactionLog"> | bigint | number | null
    slot?: BigIntNullableWithAggregatesFilter<"TransactionLog"> | bigint | number | null
    status?: StringWithAggregatesFilter<"TransactionLog"> | string
    errorMessage?: StringNullableWithAggregatesFilter<"TransactionLog"> | string | null
    timestamp?: DateTimeWithAggregatesFilter<"TransactionLog"> | Date | string
  }

  export type WebhookWhereInput = {
    AND?: WebhookWhereInput | WebhookWhereInput[]
    OR?: WebhookWhereInput[]
    NOT?: WebhookWhereInput | WebhookWhereInput[]
    id?: StringFilter<"Webhook"> | string
    agreementId?: StringFilter<"Webhook"> | string
    eventType?: EnumWebhookEventTypeFilter<"Webhook"> | $Enums.WebhookEventType
    targetUrl?: StringFilter<"Webhook"> | string
    payload?: JsonFilter<"Webhook">
    status?: EnumWebhookDeliveryStatusFilter<"Webhook"> | $Enums.WebhookDeliveryStatus
    attempts?: IntFilter<"Webhook"> | number
    maxAttempts?: IntFilter<"Webhook"> | number
    lastAttemptAt?: DateTimeNullableFilter<"Webhook"> | Date | string | null
    lastResponseCode?: IntNullableFilter<"Webhook"> | number | null
    lastResponseBody?: StringNullableFilter<"Webhook"> | string | null
    deliveredAt?: DateTimeNullableFilter<"Webhook"> | Date | string | null
    signature?: StringNullableFilter<"Webhook"> | string | null
    createdAt?: DateTimeFilter<"Webhook"> | Date | string
    scheduledFor?: DateTimeFilter<"Webhook"> | Date | string
    agreement?: XOR<AgreementScalarRelationFilter, AgreementWhereInput>
  }

  export type WebhookOrderByWithRelationInput = {
    id?: SortOrder
    agreementId?: SortOrder
    eventType?: SortOrder
    targetUrl?: SortOrder
    payload?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    lastAttemptAt?: SortOrderInput | SortOrder
    lastResponseCode?: SortOrderInput | SortOrder
    lastResponseBody?: SortOrderInput | SortOrder
    deliveredAt?: SortOrderInput | SortOrder
    signature?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    scheduledFor?: SortOrder
    agreement?: AgreementOrderByWithRelationInput
  }

  export type WebhookWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: WebhookWhereInput | WebhookWhereInput[]
    OR?: WebhookWhereInput[]
    NOT?: WebhookWhereInput | WebhookWhereInput[]
    agreementId?: StringFilter<"Webhook"> | string
    eventType?: EnumWebhookEventTypeFilter<"Webhook"> | $Enums.WebhookEventType
    targetUrl?: StringFilter<"Webhook"> | string
    payload?: JsonFilter<"Webhook">
    status?: EnumWebhookDeliveryStatusFilter<"Webhook"> | $Enums.WebhookDeliveryStatus
    attempts?: IntFilter<"Webhook"> | number
    maxAttempts?: IntFilter<"Webhook"> | number
    lastAttemptAt?: DateTimeNullableFilter<"Webhook"> | Date | string | null
    lastResponseCode?: IntNullableFilter<"Webhook"> | number | null
    lastResponseBody?: StringNullableFilter<"Webhook"> | string | null
    deliveredAt?: DateTimeNullableFilter<"Webhook"> | Date | string | null
    signature?: StringNullableFilter<"Webhook"> | string | null
    createdAt?: DateTimeFilter<"Webhook"> | Date | string
    scheduledFor?: DateTimeFilter<"Webhook"> | Date | string
    agreement?: XOR<AgreementScalarRelationFilter, AgreementWhereInput>
  }, "id">

  export type WebhookOrderByWithAggregationInput = {
    id?: SortOrder
    agreementId?: SortOrder
    eventType?: SortOrder
    targetUrl?: SortOrder
    payload?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    lastAttemptAt?: SortOrderInput | SortOrder
    lastResponseCode?: SortOrderInput | SortOrder
    lastResponseBody?: SortOrderInput | SortOrder
    deliveredAt?: SortOrderInput | SortOrder
    signature?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    scheduledFor?: SortOrder
    _count?: WebhookCountOrderByAggregateInput
    _avg?: WebhookAvgOrderByAggregateInput
    _max?: WebhookMaxOrderByAggregateInput
    _min?: WebhookMinOrderByAggregateInput
    _sum?: WebhookSumOrderByAggregateInput
  }

  export type WebhookScalarWhereWithAggregatesInput = {
    AND?: WebhookScalarWhereWithAggregatesInput | WebhookScalarWhereWithAggregatesInput[]
    OR?: WebhookScalarWhereWithAggregatesInput[]
    NOT?: WebhookScalarWhereWithAggregatesInput | WebhookScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Webhook"> | string
    agreementId?: StringWithAggregatesFilter<"Webhook"> | string
    eventType?: EnumWebhookEventTypeWithAggregatesFilter<"Webhook"> | $Enums.WebhookEventType
    targetUrl?: StringWithAggregatesFilter<"Webhook"> | string
    payload?: JsonWithAggregatesFilter<"Webhook">
    status?: EnumWebhookDeliveryStatusWithAggregatesFilter<"Webhook"> | $Enums.WebhookDeliveryStatus
    attempts?: IntWithAggregatesFilter<"Webhook"> | number
    maxAttempts?: IntWithAggregatesFilter<"Webhook"> | number
    lastAttemptAt?: DateTimeNullableWithAggregatesFilter<"Webhook"> | Date | string | null
    lastResponseCode?: IntNullableWithAggregatesFilter<"Webhook"> | number | null
    lastResponseBody?: StringNullableWithAggregatesFilter<"Webhook"> | string | null
    deliveredAt?: DateTimeNullableWithAggregatesFilter<"Webhook"> | Date | string | null
    signature?: StringNullableWithAggregatesFilter<"Webhook"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Webhook"> | Date | string
    scheduledFor?: DateTimeWithAggregatesFilter<"Webhook"> | Date | string
  }

  export type AgreementCreateInput = {
    id?: string
    agreementId: string
    escrowPda: string
    nftMint: string
    seller: string
    buyer?: string | null
    price: Decimal | DecimalJsLike | number | string
    feeBps: number
    honorRoyalties?: boolean
    status?: $Enums.AgreementStatus
    expiry: Date | string
    usdcDepositAddr?: string | null
    nftDepositAddr?: string | null
    initTxId?: string | null
    settleTxId?: string | null
    cancelTxId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    settledAt?: Date | string | null
    cancelledAt?: Date | string | null
    deposits?: DepositCreateNestedManyWithoutAgreementInput
    settlement?: SettlementCreateNestedOneWithoutAgreementInput
    receipt?: ReceiptCreateNestedOneWithoutAgreementInput
    webhooks?: WebhookCreateNestedManyWithoutAgreementInput
  }

  export type AgreementUncheckedCreateInput = {
    id?: string
    agreementId: string
    escrowPda: string
    nftMint: string
    seller: string
    buyer?: string | null
    price: Decimal | DecimalJsLike | number | string
    feeBps: number
    honorRoyalties?: boolean
    status?: $Enums.AgreementStatus
    expiry: Date | string
    usdcDepositAddr?: string | null
    nftDepositAddr?: string | null
    initTxId?: string | null
    settleTxId?: string | null
    cancelTxId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    settledAt?: Date | string | null
    cancelledAt?: Date | string | null
    deposits?: DepositUncheckedCreateNestedManyWithoutAgreementInput
    settlement?: SettlementUncheckedCreateNestedOneWithoutAgreementInput
    receipt?: ReceiptUncheckedCreateNestedOneWithoutAgreementInput
    webhooks?: WebhookUncheckedCreateNestedManyWithoutAgreementInput
  }

  export type AgreementUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    escrowPda?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    buyer?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    feeBps?: IntFieldUpdateOperationsInput | number
    honorRoyalties?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAgreementStatusFieldUpdateOperationsInput | $Enums.AgreementStatus
    expiry?: DateTimeFieldUpdateOperationsInput | Date | string
    usdcDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    nftDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    initTxId?: NullableStringFieldUpdateOperationsInput | string | null
    settleTxId?: NullableStringFieldUpdateOperationsInput | string | null
    cancelTxId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cancelledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    deposits?: DepositUpdateManyWithoutAgreementNestedInput
    settlement?: SettlementUpdateOneWithoutAgreementNestedInput
    receipt?: ReceiptUpdateOneWithoutAgreementNestedInput
    webhooks?: WebhookUpdateManyWithoutAgreementNestedInput
  }

  export type AgreementUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    escrowPda?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    buyer?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    feeBps?: IntFieldUpdateOperationsInput | number
    honorRoyalties?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAgreementStatusFieldUpdateOperationsInput | $Enums.AgreementStatus
    expiry?: DateTimeFieldUpdateOperationsInput | Date | string
    usdcDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    nftDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    initTxId?: NullableStringFieldUpdateOperationsInput | string | null
    settleTxId?: NullableStringFieldUpdateOperationsInput | string | null
    cancelTxId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cancelledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    deposits?: DepositUncheckedUpdateManyWithoutAgreementNestedInput
    settlement?: SettlementUncheckedUpdateOneWithoutAgreementNestedInput
    receipt?: ReceiptUncheckedUpdateOneWithoutAgreementNestedInput
    webhooks?: WebhookUncheckedUpdateManyWithoutAgreementNestedInput
  }

  export type AgreementCreateManyInput = {
    id?: string
    agreementId: string
    escrowPda: string
    nftMint: string
    seller: string
    buyer?: string | null
    price: Decimal | DecimalJsLike | number | string
    feeBps: number
    honorRoyalties?: boolean
    status?: $Enums.AgreementStatus
    expiry: Date | string
    usdcDepositAddr?: string | null
    nftDepositAddr?: string | null
    initTxId?: string | null
    settleTxId?: string | null
    cancelTxId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    settledAt?: Date | string | null
    cancelledAt?: Date | string | null
  }

  export type AgreementUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    escrowPda?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    buyer?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    feeBps?: IntFieldUpdateOperationsInput | number
    honorRoyalties?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAgreementStatusFieldUpdateOperationsInput | $Enums.AgreementStatus
    expiry?: DateTimeFieldUpdateOperationsInput | Date | string
    usdcDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    nftDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    initTxId?: NullableStringFieldUpdateOperationsInput | string | null
    settleTxId?: NullableStringFieldUpdateOperationsInput | string | null
    cancelTxId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cancelledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type AgreementUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    escrowPda?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    buyer?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    feeBps?: IntFieldUpdateOperationsInput | number
    honorRoyalties?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAgreementStatusFieldUpdateOperationsInput | $Enums.AgreementStatus
    expiry?: DateTimeFieldUpdateOperationsInput | Date | string
    usdcDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    nftDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    initTxId?: NullableStringFieldUpdateOperationsInput | string | null
    settleTxId?: NullableStringFieldUpdateOperationsInput | string | null
    cancelTxId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cancelledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type DepositCreateInput = {
    id?: string
    type: $Enums.DepositType
    depositor: string
    amount?: Decimal | DecimalJsLike | number | string | null
    tokenAccount?: string | null
    status?: $Enums.DepositStatus
    txId?: string | null
    blockHeight?: bigint | number | null
    nftMetadata?: NullableJsonNullValueInput | InputJsonValue
    detectedAt?: Date | string
    confirmedAt?: Date | string | null
    agreement: AgreementCreateNestedOneWithoutDepositsInput
  }

  export type DepositUncheckedCreateInput = {
    id?: string
    agreementId: string
    type: $Enums.DepositType
    depositor: string
    amount?: Decimal | DecimalJsLike | number | string | null
    tokenAccount?: string | null
    status?: $Enums.DepositStatus
    txId?: string | null
    blockHeight?: bigint | number | null
    nftMetadata?: NullableJsonNullValueInput | InputJsonValue
    detectedAt?: Date | string
    confirmedAt?: Date | string | null
  }

  export type DepositUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType
    depositor?: StringFieldUpdateOperationsInput | string
    amount?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    tokenAccount?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumDepositStatusFieldUpdateOperationsInput | $Enums.DepositStatus
    txId?: NullableStringFieldUpdateOperationsInput | string | null
    blockHeight?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    nftMetadata?: NullableJsonNullValueInput | InputJsonValue
    detectedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    confirmedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    agreement?: AgreementUpdateOneRequiredWithoutDepositsNestedInput
  }

  export type DepositUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    type?: EnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType
    depositor?: StringFieldUpdateOperationsInput | string
    amount?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    tokenAccount?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumDepositStatusFieldUpdateOperationsInput | $Enums.DepositStatus
    txId?: NullableStringFieldUpdateOperationsInput | string | null
    blockHeight?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    nftMetadata?: NullableJsonNullValueInput | InputJsonValue
    detectedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    confirmedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type DepositCreateManyInput = {
    id?: string
    agreementId: string
    type: $Enums.DepositType
    depositor: string
    amount?: Decimal | DecimalJsLike | number | string | null
    tokenAccount?: string | null
    status?: $Enums.DepositStatus
    txId?: string | null
    blockHeight?: bigint | number | null
    nftMetadata?: NullableJsonNullValueInput | InputJsonValue
    detectedAt?: Date | string
    confirmedAt?: Date | string | null
  }

  export type DepositUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType
    depositor?: StringFieldUpdateOperationsInput | string
    amount?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    tokenAccount?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumDepositStatusFieldUpdateOperationsInput | $Enums.DepositStatus
    txId?: NullableStringFieldUpdateOperationsInput | string | null
    blockHeight?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    nftMetadata?: NullableJsonNullValueInput | InputJsonValue
    detectedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    confirmedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type DepositUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    type?: EnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType
    depositor?: StringFieldUpdateOperationsInput | string
    amount?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    tokenAccount?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumDepositStatusFieldUpdateOperationsInput | $Enums.DepositStatus
    txId?: NullableStringFieldUpdateOperationsInput | string | null
    blockHeight?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    nftMetadata?: NullableJsonNullValueInput | InputJsonValue
    detectedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    confirmedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type IdempotencyKeyCreateInput = {
    id?: string
    key: string
    endpoint: string
    requestHash: string
    responseStatus: number
    responseBody: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    expiresAt: Date | string
  }

  export type IdempotencyKeyUncheckedCreateInput = {
    id?: string
    key: string
    endpoint: string
    requestHash: string
    responseStatus: number
    responseBody: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    expiresAt: Date | string
  }

  export type IdempotencyKeyUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    endpoint?: StringFieldUpdateOperationsInput | string
    requestHash?: StringFieldUpdateOperationsInput | string
    responseStatus?: IntFieldUpdateOperationsInput | number
    responseBody?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type IdempotencyKeyUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    endpoint?: StringFieldUpdateOperationsInput | string
    requestHash?: StringFieldUpdateOperationsInput | string
    responseStatus?: IntFieldUpdateOperationsInput | number
    responseBody?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type IdempotencyKeyCreateManyInput = {
    id?: string
    key: string
    endpoint: string
    requestHash: string
    responseStatus: number
    responseBody: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    expiresAt: Date | string
  }

  export type IdempotencyKeyUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    endpoint?: StringFieldUpdateOperationsInput | string
    requestHash?: StringFieldUpdateOperationsInput | string
    responseStatus?: IntFieldUpdateOperationsInput | number
    responseBody?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type IdempotencyKeyUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    endpoint?: StringFieldUpdateOperationsInput | string
    requestHash?: StringFieldUpdateOperationsInput | string
    responseStatus?: IntFieldUpdateOperationsInput | number
    responseBody?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SettlementCreateInput = {
    id?: string
    nftMint: string
    price: Decimal | DecimalJsLike | number | string
    platformFee: Decimal | DecimalJsLike | number | string
    creatorRoyalty?: Decimal | DecimalJsLike | number | string | null
    sellerReceived: Decimal | DecimalJsLike | number | string
    settleTxId: string
    blockHeight: bigint | number
    buyer: string
    seller: string
    feeCollector?: string | null
    royaltyRecipient?: string | null
    settledAt?: Date | string
    agreement: AgreementCreateNestedOneWithoutSettlementInput
  }

  export type SettlementUncheckedCreateInput = {
    id?: string
    agreementId: string
    nftMint: string
    price: Decimal | DecimalJsLike | number | string
    platformFee: Decimal | DecimalJsLike | number | string
    creatorRoyalty?: Decimal | DecimalJsLike | number | string | null
    sellerReceived: Decimal | DecimalJsLike | number | string
    settleTxId: string
    blockHeight: bigint | number
    buyer: string
    seller: string
    feeCollector?: string | null
    royaltyRecipient?: string | null
    settledAt?: Date | string
  }

  export type SettlementUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    sellerReceived?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    settleTxId?: StringFieldUpdateOperationsInput | string
    blockHeight?: BigIntFieldUpdateOperationsInput | bigint | number
    buyer?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    feeCollector?: NullableStringFieldUpdateOperationsInput | string | null
    royaltyRecipient?: NullableStringFieldUpdateOperationsInput | string | null
    settledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    agreement?: AgreementUpdateOneRequiredWithoutSettlementNestedInput
  }

  export type SettlementUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    sellerReceived?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    settleTxId?: StringFieldUpdateOperationsInput | string
    blockHeight?: BigIntFieldUpdateOperationsInput | bigint | number
    buyer?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    feeCollector?: NullableStringFieldUpdateOperationsInput | string | null
    royaltyRecipient?: NullableStringFieldUpdateOperationsInput | string | null
    settledAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SettlementCreateManyInput = {
    id?: string
    agreementId: string
    nftMint: string
    price: Decimal | DecimalJsLike | number | string
    platformFee: Decimal | DecimalJsLike | number | string
    creatorRoyalty?: Decimal | DecimalJsLike | number | string | null
    sellerReceived: Decimal | DecimalJsLike | number | string
    settleTxId: string
    blockHeight: bigint | number
    buyer: string
    seller: string
    feeCollector?: string | null
    royaltyRecipient?: string | null
    settledAt?: Date | string
  }

  export type SettlementUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    sellerReceived?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    settleTxId?: StringFieldUpdateOperationsInput | string
    blockHeight?: BigIntFieldUpdateOperationsInput | bigint | number
    buyer?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    feeCollector?: NullableStringFieldUpdateOperationsInput | string | null
    royaltyRecipient?: NullableStringFieldUpdateOperationsInput | string | null
    settledAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SettlementUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    sellerReceived?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    settleTxId?: StringFieldUpdateOperationsInput | string
    blockHeight?: BigIntFieldUpdateOperationsInput | bigint | number
    buyer?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    feeCollector?: NullableStringFieldUpdateOperationsInput | string | null
    royaltyRecipient?: NullableStringFieldUpdateOperationsInput | string | null
    settledAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReceiptCreateInput = {
    id?: string
    nftMint: string
    price: Decimal | DecimalJsLike | number | string
    platformFee: Decimal | DecimalJsLike | number | string
    creatorRoyalty?: Decimal | DecimalJsLike | number | string | null
    buyer: string
    seller: string
    escrowTxId: string
    settlementTxId: string
    receiptHash: string
    signature: string
    createdAt: Date | string
    settledAt: Date | string
    generatedAt?: Date | string
    agreement: AgreementCreateNestedOneWithoutReceiptInput
  }

  export type ReceiptUncheckedCreateInput = {
    id?: string
    agreementId: string
    nftMint: string
    price: Decimal | DecimalJsLike | number | string
    platformFee: Decimal | DecimalJsLike | number | string
    creatorRoyalty?: Decimal | DecimalJsLike | number | string | null
    buyer: string
    seller: string
    escrowTxId: string
    settlementTxId: string
    receiptHash: string
    signature: string
    createdAt: Date | string
    settledAt: Date | string
    generatedAt?: Date | string
  }

  export type ReceiptUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    buyer?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    escrowTxId?: StringFieldUpdateOperationsInput | string
    settlementTxId?: StringFieldUpdateOperationsInput | string
    receiptHash?: StringFieldUpdateOperationsInput | string
    signature?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    agreement?: AgreementUpdateOneRequiredWithoutReceiptNestedInput
  }

  export type ReceiptUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    buyer?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    escrowTxId?: StringFieldUpdateOperationsInput | string
    settlementTxId?: StringFieldUpdateOperationsInput | string
    receiptHash?: StringFieldUpdateOperationsInput | string
    signature?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReceiptCreateManyInput = {
    id?: string
    agreementId: string
    nftMint: string
    price: Decimal | DecimalJsLike | number | string
    platformFee: Decimal | DecimalJsLike | number | string
    creatorRoyalty?: Decimal | DecimalJsLike | number | string | null
    buyer: string
    seller: string
    escrowTxId: string
    settlementTxId: string
    receiptHash: string
    signature: string
    createdAt: Date | string
    settledAt: Date | string
    generatedAt?: Date | string
  }

  export type ReceiptUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    buyer?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    escrowTxId?: StringFieldUpdateOperationsInput | string
    settlementTxId?: StringFieldUpdateOperationsInput | string
    receiptHash?: StringFieldUpdateOperationsInput | string
    signature?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReceiptUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    buyer?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    escrowTxId?: StringFieldUpdateOperationsInput | string
    settlementTxId?: StringFieldUpdateOperationsInput | string
    receiptHash?: StringFieldUpdateOperationsInput | string
    signature?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TransactionLogCreateInput = {
    id?: string
    agreementId?: string | null
    txId: string
    operationType: string
    blockHeight?: bigint | number | null
    slot?: bigint | number | null
    status: string
    errorMessage?: string | null
    timestamp?: Date | string
  }

  export type TransactionLogUncheckedCreateInput = {
    id?: string
    agreementId?: string | null
    txId: string
    operationType: string
    blockHeight?: bigint | number | null
    slot?: bigint | number | null
    status: string
    errorMessage?: string | null
    timestamp?: Date | string
  }

  export type TransactionLogUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: NullableStringFieldUpdateOperationsInput | string | null
    txId?: StringFieldUpdateOperationsInput | string
    operationType?: StringFieldUpdateOperationsInput | string
    blockHeight?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    slot?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    status?: StringFieldUpdateOperationsInput | string
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TransactionLogUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: NullableStringFieldUpdateOperationsInput | string | null
    txId?: StringFieldUpdateOperationsInput | string
    operationType?: StringFieldUpdateOperationsInput | string
    blockHeight?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    slot?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    status?: StringFieldUpdateOperationsInput | string
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TransactionLogCreateManyInput = {
    id?: string
    agreementId?: string | null
    txId: string
    operationType: string
    blockHeight?: bigint | number | null
    slot?: bigint | number | null
    status: string
    errorMessage?: string | null
    timestamp?: Date | string
  }

  export type TransactionLogUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: NullableStringFieldUpdateOperationsInput | string | null
    txId?: StringFieldUpdateOperationsInput | string
    operationType?: StringFieldUpdateOperationsInput | string
    blockHeight?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    slot?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    status?: StringFieldUpdateOperationsInput | string
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TransactionLogUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: NullableStringFieldUpdateOperationsInput | string | null
    txId?: StringFieldUpdateOperationsInput | string
    operationType?: StringFieldUpdateOperationsInput | string
    blockHeight?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    slot?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    status?: StringFieldUpdateOperationsInput | string
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WebhookCreateInput = {
    id?: string
    eventType: $Enums.WebhookEventType
    targetUrl: string
    payload: JsonNullValueInput | InputJsonValue
    status?: $Enums.WebhookDeliveryStatus
    attempts?: number
    maxAttempts?: number
    lastAttemptAt?: Date | string | null
    lastResponseCode?: number | null
    lastResponseBody?: string | null
    deliveredAt?: Date | string | null
    signature?: string | null
    createdAt?: Date | string
    scheduledFor?: Date | string
    agreement: AgreementCreateNestedOneWithoutWebhooksInput
  }

  export type WebhookUncheckedCreateInput = {
    id?: string
    agreementId: string
    eventType: $Enums.WebhookEventType
    targetUrl: string
    payload: JsonNullValueInput | InputJsonValue
    status?: $Enums.WebhookDeliveryStatus
    attempts?: number
    maxAttempts?: number
    lastAttemptAt?: Date | string | null
    lastResponseCode?: number | null
    lastResponseBody?: string | null
    deliveredAt?: Date | string | null
    signature?: string | null
    createdAt?: Date | string
    scheduledFor?: Date | string
  }

  export type WebhookUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventType?: EnumWebhookEventTypeFieldUpdateOperationsInput | $Enums.WebhookEventType
    targetUrl?: StringFieldUpdateOperationsInput | string
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumWebhookDeliveryStatusFieldUpdateOperationsInput | $Enums.WebhookDeliveryStatus
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    lastAttemptAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastResponseCode?: NullableIntFieldUpdateOperationsInput | number | null
    lastResponseBody?: NullableStringFieldUpdateOperationsInput | string | null
    deliveredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    signature?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    scheduledFor?: DateTimeFieldUpdateOperationsInput | Date | string
    agreement?: AgreementUpdateOneRequiredWithoutWebhooksNestedInput
  }

  export type WebhookUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    eventType?: EnumWebhookEventTypeFieldUpdateOperationsInput | $Enums.WebhookEventType
    targetUrl?: StringFieldUpdateOperationsInput | string
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumWebhookDeliveryStatusFieldUpdateOperationsInput | $Enums.WebhookDeliveryStatus
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    lastAttemptAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastResponseCode?: NullableIntFieldUpdateOperationsInput | number | null
    lastResponseBody?: NullableStringFieldUpdateOperationsInput | string | null
    deliveredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    signature?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    scheduledFor?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WebhookCreateManyInput = {
    id?: string
    agreementId: string
    eventType: $Enums.WebhookEventType
    targetUrl: string
    payload: JsonNullValueInput | InputJsonValue
    status?: $Enums.WebhookDeliveryStatus
    attempts?: number
    maxAttempts?: number
    lastAttemptAt?: Date | string | null
    lastResponseCode?: number | null
    lastResponseBody?: string | null
    deliveredAt?: Date | string | null
    signature?: string | null
    createdAt?: Date | string
    scheduledFor?: Date | string
  }

  export type WebhookUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventType?: EnumWebhookEventTypeFieldUpdateOperationsInput | $Enums.WebhookEventType
    targetUrl?: StringFieldUpdateOperationsInput | string
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumWebhookDeliveryStatusFieldUpdateOperationsInput | $Enums.WebhookDeliveryStatus
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    lastAttemptAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastResponseCode?: NullableIntFieldUpdateOperationsInput | number | null
    lastResponseBody?: NullableStringFieldUpdateOperationsInput | string | null
    deliveredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    signature?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    scheduledFor?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WebhookUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    eventType?: EnumWebhookEventTypeFieldUpdateOperationsInput | $Enums.WebhookEventType
    targetUrl?: StringFieldUpdateOperationsInput | string
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumWebhookDeliveryStatusFieldUpdateOperationsInput | $Enums.WebhookDeliveryStatus
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    lastAttemptAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastResponseCode?: NullableIntFieldUpdateOperationsInput | number | null
    lastResponseBody?: NullableStringFieldUpdateOperationsInput | string | null
    deliveredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    signature?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    scheduledFor?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type DecimalFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type EnumAgreementStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.AgreementStatus | EnumAgreementStatusFieldRefInput<$PrismaModel>
    in?: $Enums.AgreementStatus[] | ListEnumAgreementStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.AgreementStatus[] | ListEnumAgreementStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumAgreementStatusFilter<$PrismaModel> | $Enums.AgreementStatus
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type DepositListRelationFilter = {
    every?: DepositWhereInput
    some?: DepositWhereInput
    none?: DepositWhereInput
  }

  export type SettlementNullableScalarRelationFilter = {
    is?: SettlementWhereInput | null
    isNot?: SettlementWhereInput | null
  }

  export type ReceiptNullableScalarRelationFilter = {
    is?: ReceiptWhereInput | null
    isNot?: ReceiptWhereInput | null
  }

  export type WebhookListRelationFilter = {
    every?: WebhookWhereInput
    some?: WebhookWhereInput
    none?: WebhookWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type DepositOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type WebhookOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type AgreementCountOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    escrowPda?: SortOrder
    nftMint?: SortOrder
    seller?: SortOrder
    buyer?: SortOrder
    price?: SortOrder
    feeBps?: SortOrder
    honorRoyalties?: SortOrder
    status?: SortOrder
    expiry?: SortOrder
    usdcDepositAddr?: SortOrder
    nftDepositAddr?: SortOrder
    initTxId?: SortOrder
    settleTxId?: SortOrder
    cancelTxId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    settledAt?: SortOrder
    cancelledAt?: SortOrder
  }

  export type AgreementAvgOrderByAggregateInput = {
    price?: SortOrder
    feeBps?: SortOrder
  }

  export type AgreementMaxOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    escrowPda?: SortOrder
    nftMint?: SortOrder
    seller?: SortOrder
    buyer?: SortOrder
    price?: SortOrder
    feeBps?: SortOrder
    honorRoyalties?: SortOrder
    status?: SortOrder
    expiry?: SortOrder
    usdcDepositAddr?: SortOrder
    nftDepositAddr?: SortOrder
    initTxId?: SortOrder
    settleTxId?: SortOrder
    cancelTxId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    settledAt?: SortOrder
    cancelledAt?: SortOrder
  }

  export type AgreementMinOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    escrowPda?: SortOrder
    nftMint?: SortOrder
    seller?: SortOrder
    buyer?: SortOrder
    price?: SortOrder
    feeBps?: SortOrder
    honorRoyalties?: SortOrder
    status?: SortOrder
    expiry?: SortOrder
    usdcDepositAddr?: SortOrder
    nftDepositAddr?: SortOrder
    initTxId?: SortOrder
    settleTxId?: SortOrder
    cancelTxId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    settledAt?: SortOrder
    cancelledAt?: SortOrder
  }

  export type AgreementSumOrderByAggregateInput = {
    price?: SortOrder
    feeBps?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type DecimalWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalWithAggregatesFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedDecimalFilter<$PrismaModel>
    _sum?: NestedDecimalFilter<$PrismaModel>
    _min?: NestedDecimalFilter<$PrismaModel>
    _max?: NestedDecimalFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type EnumAgreementStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.AgreementStatus | EnumAgreementStatusFieldRefInput<$PrismaModel>
    in?: $Enums.AgreementStatus[] | ListEnumAgreementStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.AgreementStatus[] | ListEnumAgreementStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumAgreementStatusWithAggregatesFilter<$PrismaModel> | $Enums.AgreementStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumAgreementStatusFilter<$PrismaModel>
    _max?: NestedEnumAgreementStatusFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type EnumDepositTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositType | EnumDepositTypeFieldRefInput<$PrismaModel>
    in?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumDepositTypeFilter<$PrismaModel> | $Enums.DepositType
  }

  export type DecimalNullableFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel> | null
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalNullableFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string | null
  }

  export type EnumDepositStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositStatus | EnumDepositStatusFieldRefInput<$PrismaModel>
    in?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumDepositStatusFilter<$PrismaModel> | $Enums.DepositStatus
  }

  export type BigIntNullableFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel> | null
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel> | null
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel> | null
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntNullableFilter<$PrismaModel> | bigint | number | null
  }
  export type JsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type AgreementScalarRelationFilter = {
    is?: AgreementWhereInput
    isNot?: AgreementWhereInput
  }

  export type DepositCountOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    type?: SortOrder
    depositor?: SortOrder
    amount?: SortOrder
    tokenAccount?: SortOrder
    status?: SortOrder
    txId?: SortOrder
    blockHeight?: SortOrder
    nftMetadata?: SortOrder
    detectedAt?: SortOrder
    confirmedAt?: SortOrder
  }

  export type DepositAvgOrderByAggregateInput = {
    amount?: SortOrder
    blockHeight?: SortOrder
  }

  export type DepositMaxOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    type?: SortOrder
    depositor?: SortOrder
    amount?: SortOrder
    tokenAccount?: SortOrder
    status?: SortOrder
    txId?: SortOrder
    blockHeight?: SortOrder
    detectedAt?: SortOrder
    confirmedAt?: SortOrder
  }

  export type DepositMinOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    type?: SortOrder
    depositor?: SortOrder
    amount?: SortOrder
    tokenAccount?: SortOrder
    status?: SortOrder
    txId?: SortOrder
    blockHeight?: SortOrder
    detectedAt?: SortOrder
    confirmedAt?: SortOrder
  }

  export type DepositSumOrderByAggregateInput = {
    amount?: SortOrder
    blockHeight?: SortOrder
  }

  export type EnumDepositTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositType | EnumDepositTypeFieldRefInput<$PrismaModel>
    in?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumDepositTypeWithAggregatesFilter<$PrismaModel> | $Enums.DepositType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumDepositTypeFilter<$PrismaModel>
    _max?: NestedEnumDepositTypeFilter<$PrismaModel>
  }

  export type DecimalNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel> | null
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalNullableWithAggregatesFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedDecimalNullableFilter<$PrismaModel>
    _sum?: NestedDecimalNullableFilter<$PrismaModel>
    _min?: NestedDecimalNullableFilter<$PrismaModel>
    _max?: NestedDecimalNullableFilter<$PrismaModel>
  }

  export type EnumDepositStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositStatus | EnumDepositStatusFieldRefInput<$PrismaModel>
    in?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumDepositStatusWithAggregatesFilter<$PrismaModel> | $Enums.DepositStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumDepositStatusFilter<$PrismaModel>
    _max?: NestedEnumDepositStatusFilter<$PrismaModel>
  }

  export type BigIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel> | null
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel> | null
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel> | null
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntNullableWithAggregatesFilter<$PrismaModel> | bigint | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedBigIntNullableFilter<$PrismaModel>
    _min?: NestedBigIntNullableFilter<$PrismaModel>
    _max?: NestedBigIntNullableFilter<$PrismaModel>
  }
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }
  export type JsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type IdempotencyKeyCountOrderByAggregateInput = {
    id?: SortOrder
    key?: SortOrder
    endpoint?: SortOrder
    requestHash?: SortOrder
    responseStatus?: SortOrder
    responseBody?: SortOrder
    createdAt?: SortOrder
    expiresAt?: SortOrder
  }

  export type IdempotencyKeyAvgOrderByAggregateInput = {
    responseStatus?: SortOrder
  }

  export type IdempotencyKeyMaxOrderByAggregateInput = {
    id?: SortOrder
    key?: SortOrder
    endpoint?: SortOrder
    requestHash?: SortOrder
    responseStatus?: SortOrder
    createdAt?: SortOrder
    expiresAt?: SortOrder
  }

  export type IdempotencyKeyMinOrderByAggregateInput = {
    id?: SortOrder
    key?: SortOrder
    endpoint?: SortOrder
    requestHash?: SortOrder
    responseStatus?: SortOrder
    createdAt?: SortOrder
    expiresAt?: SortOrder
  }

  export type IdempotencyKeySumOrderByAggregateInput = {
    responseStatus?: SortOrder
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }

  export type BigIntFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntFilter<$PrismaModel> | bigint | number
  }

  export type SettlementCountOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    nftMint?: SortOrder
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrder
    sellerReceived?: SortOrder
    settleTxId?: SortOrder
    blockHeight?: SortOrder
    buyer?: SortOrder
    seller?: SortOrder
    feeCollector?: SortOrder
    royaltyRecipient?: SortOrder
    settledAt?: SortOrder
  }

  export type SettlementAvgOrderByAggregateInput = {
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrder
    sellerReceived?: SortOrder
    blockHeight?: SortOrder
  }

  export type SettlementMaxOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    nftMint?: SortOrder
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrder
    sellerReceived?: SortOrder
    settleTxId?: SortOrder
    blockHeight?: SortOrder
    buyer?: SortOrder
    seller?: SortOrder
    feeCollector?: SortOrder
    royaltyRecipient?: SortOrder
    settledAt?: SortOrder
  }

  export type SettlementMinOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    nftMint?: SortOrder
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrder
    sellerReceived?: SortOrder
    settleTxId?: SortOrder
    blockHeight?: SortOrder
    buyer?: SortOrder
    seller?: SortOrder
    feeCollector?: SortOrder
    royaltyRecipient?: SortOrder
    settledAt?: SortOrder
  }

  export type SettlementSumOrderByAggregateInput = {
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrder
    sellerReceived?: SortOrder
    blockHeight?: SortOrder
  }

  export type BigIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntWithAggregatesFilter<$PrismaModel> | bigint | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedBigIntFilter<$PrismaModel>
    _min?: NestedBigIntFilter<$PrismaModel>
    _max?: NestedBigIntFilter<$PrismaModel>
  }

  export type ReceiptCountOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    nftMint?: SortOrder
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrder
    buyer?: SortOrder
    seller?: SortOrder
    escrowTxId?: SortOrder
    settlementTxId?: SortOrder
    receiptHash?: SortOrder
    signature?: SortOrder
    createdAt?: SortOrder
    settledAt?: SortOrder
    generatedAt?: SortOrder
  }

  export type ReceiptAvgOrderByAggregateInput = {
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrder
  }

  export type ReceiptMaxOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    nftMint?: SortOrder
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrder
    buyer?: SortOrder
    seller?: SortOrder
    escrowTxId?: SortOrder
    settlementTxId?: SortOrder
    receiptHash?: SortOrder
    signature?: SortOrder
    createdAt?: SortOrder
    settledAt?: SortOrder
    generatedAt?: SortOrder
  }

  export type ReceiptMinOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    nftMint?: SortOrder
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrder
    buyer?: SortOrder
    seller?: SortOrder
    escrowTxId?: SortOrder
    settlementTxId?: SortOrder
    receiptHash?: SortOrder
    signature?: SortOrder
    createdAt?: SortOrder
    settledAt?: SortOrder
    generatedAt?: SortOrder
  }

  export type ReceiptSumOrderByAggregateInput = {
    price?: SortOrder
    platformFee?: SortOrder
    creatorRoyalty?: SortOrder
  }

  export type TransactionLogCountOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    txId?: SortOrder
    operationType?: SortOrder
    blockHeight?: SortOrder
    slot?: SortOrder
    status?: SortOrder
    errorMessage?: SortOrder
    timestamp?: SortOrder
  }

  export type TransactionLogAvgOrderByAggregateInput = {
    blockHeight?: SortOrder
    slot?: SortOrder
  }

  export type TransactionLogMaxOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    txId?: SortOrder
    operationType?: SortOrder
    blockHeight?: SortOrder
    slot?: SortOrder
    status?: SortOrder
    errorMessage?: SortOrder
    timestamp?: SortOrder
  }

  export type TransactionLogMinOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    txId?: SortOrder
    operationType?: SortOrder
    blockHeight?: SortOrder
    slot?: SortOrder
    status?: SortOrder
    errorMessage?: SortOrder
    timestamp?: SortOrder
  }

  export type TransactionLogSumOrderByAggregateInput = {
    blockHeight?: SortOrder
    slot?: SortOrder
  }

  export type EnumWebhookEventTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.WebhookEventType | EnumWebhookEventTypeFieldRefInput<$PrismaModel>
    in?: $Enums.WebhookEventType[] | ListEnumWebhookEventTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.WebhookEventType[] | ListEnumWebhookEventTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumWebhookEventTypeFilter<$PrismaModel> | $Enums.WebhookEventType
  }

  export type EnumWebhookDeliveryStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.WebhookDeliveryStatus | EnumWebhookDeliveryStatusFieldRefInput<$PrismaModel>
    in?: $Enums.WebhookDeliveryStatus[] | ListEnumWebhookDeliveryStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.WebhookDeliveryStatus[] | ListEnumWebhookDeliveryStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumWebhookDeliveryStatusFilter<$PrismaModel> | $Enums.WebhookDeliveryStatus
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type WebhookCountOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    eventType?: SortOrder
    targetUrl?: SortOrder
    payload?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    lastAttemptAt?: SortOrder
    lastResponseCode?: SortOrder
    lastResponseBody?: SortOrder
    deliveredAt?: SortOrder
    signature?: SortOrder
    createdAt?: SortOrder
    scheduledFor?: SortOrder
  }

  export type WebhookAvgOrderByAggregateInput = {
    attempts?: SortOrder
    maxAttempts?: SortOrder
    lastResponseCode?: SortOrder
  }

  export type WebhookMaxOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    eventType?: SortOrder
    targetUrl?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    lastAttemptAt?: SortOrder
    lastResponseCode?: SortOrder
    lastResponseBody?: SortOrder
    deliveredAt?: SortOrder
    signature?: SortOrder
    createdAt?: SortOrder
    scheduledFor?: SortOrder
  }

  export type WebhookMinOrderByAggregateInput = {
    id?: SortOrder
    agreementId?: SortOrder
    eventType?: SortOrder
    targetUrl?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    lastAttemptAt?: SortOrder
    lastResponseCode?: SortOrder
    lastResponseBody?: SortOrder
    deliveredAt?: SortOrder
    signature?: SortOrder
    createdAt?: SortOrder
    scheduledFor?: SortOrder
  }

  export type WebhookSumOrderByAggregateInput = {
    attempts?: SortOrder
    maxAttempts?: SortOrder
    lastResponseCode?: SortOrder
  }

  export type EnumWebhookEventTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.WebhookEventType | EnumWebhookEventTypeFieldRefInput<$PrismaModel>
    in?: $Enums.WebhookEventType[] | ListEnumWebhookEventTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.WebhookEventType[] | ListEnumWebhookEventTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumWebhookEventTypeWithAggregatesFilter<$PrismaModel> | $Enums.WebhookEventType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumWebhookEventTypeFilter<$PrismaModel>
    _max?: NestedEnumWebhookEventTypeFilter<$PrismaModel>
  }

  export type EnumWebhookDeliveryStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.WebhookDeliveryStatus | EnumWebhookDeliveryStatusFieldRefInput<$PrismaModel>
    in?: $Enums.WebhookDeliveryStatus[] | ListEnumWebhookDeliveryStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.WebhookDeliveryStatus[] | ListEnumWebhookDeliveryStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumWebhookDeliveryStatusWithAggregatesFilter<$PrismaModel> | $Enums.WebhookDeliveryStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumWebhookDeliveryStatusFilter<$PrismaModel>
    _max?: NestedEnumWebhookDeliveryStatusFilter<$PrismaModel>
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type DepositCreateNestedManyWithoutAgreementInput = {
    create?: XOR<DepositCreateWithoutAgreementInput, DepositUncheckedCreateWithoutAgreementInput> | DepositCreateWithoutAgreementInput[] | DepositUncheckedCreateWithoutAgreementInput[]
    connectOrCreate?: DepositCreateOrConnectWithoutAgreementInput | DepositCreateOrConnectWithoutAgreementInput[]
    createMany?: DepositCreateManyAgreementInputEnvelope
    connect?: DepositWhereUniqueInput | DepositWhereUniqueInput[]
  }

  export type SettlementCreateNestedOneWithoutAgreementInput = {
    create?: XOR<SettlementCreateWithoutAgreementInput, SettlementUncheckedCreateWithoutAgreementInput>
    connectOrCreate?: SettlementCreateOrConnectWithoutAgreementInput
    connect?: SettlementWhereUniqueInput
  }

  export type ReceiptCreateNestedOneWithoutAgreementInput = {
    create?: XOR<ReceiptCreateWithoutAgreementInput, ReceiptUncheckedCreateWithoutAgreementInput>
    connectOrCreate?: ReceiptCreateOrConnectWithoutAgreementInput
    connect?: ReceiptWhereUniqueInput
  }

  export type WebhookCreateNestedManyWithoutAgreementInput = {
    create?: XOR<WebhookCreateWithoutAgreementInput, WebhookUncheckedCreateWithoutAgreementInput> | WebhookCreateWithoutAgreementInput[] | WebhookUncheckedCreateWithoutAgreementInput[]
    connectOrCreate?: WebhookCreateOrConnectWithoutAgreementInput | WebhookCreateOrConnectWithoutAgreementInput[]
    createMany?: WebhookCreateManyAgreementInputEnvelope
    connect?: WebhookWhereUniqueInput | WebhookWhereUniqueInput[]
  }

  export type DepositUncheckedCreateNestedManyWithoutAgreementInput = {
    create?: XOR<DepositCreateWithoutAgreementInput, DepositUncheckedCreateWithoutAgreementInput> | DepositCreateWithoutAgreementInput[] | DepositUncheckedCreateWithoutAgreementInput[]
    connectOrCreate?: DepositCreateOrConnectWithoutAgreementInput | DepositCreateOrConnectWithoutAgreementInput[]
    createMany?: DepositCreateManyAgreementInputEnvelope
    connect?: DepositWhereUniqueInput | DepositWhereUniqueInput[]
  }

  export type SettlementUncheckedCreateNestedOneWithoutAgreementInput = {
    create?: XOR<SettlementCreateWithoutAgreementInput, SettlementUncheckedCreateWithoutAgreementInput>
    connectOrCreate?: SettlementCreateOrConnectWithoutAgreementInput
    connect?: SettlementWhereUniqueInput
  }

  export type ReceiptUncheckedCreateNestedOneWithoutAgreementInput = {
    create?: XOR<ReceiptCreateWithoutAgreementInput, ReceiptUncheckedCreateWithoutAgreementInput>
    connectOrCreate?: ReceiptCreateOrConnectWithoutAgreementInput
    connect?: ReceiptWhereUniqueInput
  }

  export type WebhookUncheckedCreateNestedManyWithoutAgreementInput = {
    create?: XOR<WebhookCreateWithoutAgreementInput, WebhookUncheckedCreateWithoutAgreementInput> | WebhookCreateWithoutAgreementInput[] | WebhookUncheckedCreateWithoutAgreementInput[]
    connectOrCreate?: WebhookCreateOrConnectWithoutAgreementInput | WebhookCreateOrConnectWithoutAgreementInput[]
    createMany?: WebhookCreateManyAgreementInputEnvelope
    connect?: WebhookWhereUniqueInput | WebhookWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type DecimalFieldUpdateOperationsInput = {
    set?: Decimal | DecimalJsLike | number | string
    increment?: Decimal | DecimalJsLike | number | string
    decrement?: Decimal | DecimalJsLike | number | string
    multiply?: Decimal | DecimalJsLike | number | string
    divide?: Decimal | DecimalJsLike | number | string
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type EnumAgreementStatusFieldUpdateOperationsInput = {
    set?: $Enums.AgreementStatus
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type DepositUpdateManyWithoutAgreementNestedInput = {
    create?: XOR<DepositCreateWithoutAgreementInput, DepositUncheckedCreateWithoutAgreementInput> | DepositCreateWithoutAgreementInput[] | DepositUncheckedCreateWithoutAgreementInput[]
    connectOrCreate?: DepositCreateOrConnectWithoutAgreementInput | DepositCreateOrConnectWithoutAgreementInput[]
    upsert?: DepositUpsertWithWhereUniqueWithoutAgreementInput | DepositUpsertWithWhereUniqueWithoutAgreementInput[]
    createMany?: DepositCreateManyAgreementInputEnvelope
    set?: DepositWhereUniqueInput | DepositWhereUniqueInput[]
    disconnect?: DepositWhereUniqueInput | DepositWhereUniqueInput[]
    delete?: DepositWhereUniqueInput | DepositWhereUniqueInput[]
    connect?: DepositWhereUniqueInput | DepositWhereUniqueInput[]
    update?: DepositUpdateWithWhereUniqueWithoutAgreementInput | DepositUpdateWithWhereUniqueWithoutAgreementInput[]
    updateMany?: DepositUpdateManyWithWhereWithoutAgreementInput | DepositUpdateManyWithWhereWithoutAgreementInput[]
    deleteMany?: DepositScalarWhereInput | DepositScalarWhereInput[]
  }

  export type SettlementUpdateOneWithoutAgreementNestedInput = {
    create?: XOR<SettlementCreateWithoutAgreementInput, SettlementUncheckedCreateWithoutAgreementInput>
    connectOrCreate?: SettlementCreateOrConnectWithoutAgreementInput
    upsert?: SettlementUpsertWithoutAgreementInput
    disconnect?: SettlementWhereInput | boolean
    delete?: SettlementWhereInput | boolean
    connect?: SettlementWhereUniqueInput
    update?: XOR<XOR<SettlementUpdateToOneWithWhereWithoutAgreementInput, SettlementUpdateWithoutAgreementInput>, SettlementUncheckedUpdateWithoutAgreementInput>
  }

  export type ReceiptUpdateOneWithoutAgreementNestedInput = {
    create?: XOR<ReceiptCreateWithoutAgreementInput, ReceiptUncheckedCreateWithoutAgreementInput>
    connectOrCreate?: ReceiptCreateOrConnectWithoutAgreementInput
    upsert?: ReceiptUpsertWithoutAgreementInput
    disconnect?: ReceiptWhereInput | boolean
    delete?: ReceiptWhereInput | boolean
    connect?: ReceiptWhereUniqueInput
    update?: XOR<XOR<ReceiptUpdateToOneWithWhereWithoutAgreementInput, ReceiptUpdateWithoutAgreementInput>, ReceiptUncheckedUpdateWithoutAgreementInput>
  }

  export type WebhookUpdateManyWithoutAgreementNestedInput = {
    create?: XOR<WebhookCreateWithoutAgreementInput, WebhookUncheckedCreateWithoutAgreementInput> | WebhookCreateWithoutAgreementInput[] | WebhookUncheckedCreateWithoutAgreementInput[]
    connectOrCreate?: WebhookCreateOrConnectWithoutAgreementInput | WebhookCreateOrConnectWithoutAgreementInput[]
    upsert?: WebhookUpsertWithWhereUniqueWithoutAgreementInput | WebhookUpsertWithWhereUniqueWithoutAgreementInput[]
    createMany?: WebhookCreateManyAgreementInputEnvelope
    set?: WebhookWhereUniqueInput | WebhookWhereUniqueInput[]
    disconnect?: WebhookWhereUniqueInput | WebhookWhereUniqueInput[]
    delete?: WebhookWhereUniqueInput | WebhookWhereUniqueInput[]
    connect?: WebhookWhereUniqueInput | WebhookWhereUniqueInput[]
    update?: WebhookUpdateWithWhereUniqueWithoutAgreementInput | WebhookUpdateWithWhereUniqueWithoutAgreementInput[]
    updateMany?: WebhookUpdateManyWithWhereWithoutAgreementInput | WebhookUpdateManyWithWhereWithoutAgreementInput[]
    deleteMany?: WebhookScalarWhereInput | WebhookScalarWhereInput[]
  }

  export type DepositUncheckedUpdateManyWithoutAgreementNestedInput = {
    create?: XOR<DepositCreateWithoutAgreementInput, DepositUncheckedCreateWithoutAgreementInput> | DepositCreateWithoutAgreementInput[] | DepositUncheckedCreateWithoutAgreementInput[]
    connectOrCreate?: DepositCreateOrConnectWithoutAgreementInput | DepositCreateOrConnectWithoutAgreementInput[]
    upsert?: DepositUpsertWithWhereUniqueWithoutAgreementInput | DepositUpsertWithWhereUniqueWithoutAgreementInput[]
    createMany?: DepositCreateManyAgreementInputEnvelope
    set?: DepositWhereUniqueInput | DepositWhereUniqueInput[]
    disconnect?: DepositWhereUniqueInput | DepositWhereUniqueInput[]
    delete?: DepositWhereUniqueInput | DepositWhereUniqueInput[]
    connect?: DepositWhereUniqueInput | DepositWhereUniqueInput[]
    update?: DepositUpdateWithWhereUniqueWithoutAgreementInput | DepositUpdateWithWhereUniqueWithoutAgreementInput[]
    updateMany?: DepositUpdateManyWithWhereWithoutAgreementInput | DepositUpdateManyWithWhereWithoutAgreementInput[]
    deleteMany?: DepositScalarWhereInput | DepositScalarWhereInput[]
  }

  export type SettlementUncheckedUpdateOneWithoutAgreementNestedInput = {
    create?: XOR<SettlementCreateWithoutAgreementInput, SettlementUncheckedCreateWithoutAgreementInput>
    connectOrCreate?: SettlementCreateOrConnectWithoutAgreementInput
    upsert?: SettlementUpsertWithoutAgreementInput
    disconnect?: SettlementWhereInput | boolean
    delete?: SettlementWhereInput | boolean
    connect?: SettlementWhereUniqueInput
    update?: XOR<XOR<SettlementUpdateToOneWithWhereWithoutAgreementInput, SettlementUpdateWithoutAgreementInput>, SettlementUncheckedUpdateWithoutAgreementInput>
  }

  export type ReceiptUncheckedUpdateOneWithoutAgreementNestedInput = {
    create?: XOR<ReceiptCreateWithoutAgreementInput, ReceiptUncheckedCreateWithoutAgreementInput>
    connectOrCreate?: ReceiptCreateOrConnectWithoutAgreementInput
    upsert?: ReceiptUpsertWithoutAgreementInput
    disconnect?: ReceiptWhereInput | boolean
    delete?: ReceiptWhereInput | boolean
    connect?: ReceiptWhereUniqueInput
    update?: XOR<XOR<ReceiptUpdateToOneWithWhereWithoutAgreementInput, ReceiptUpdateWithoutAgreementInput>, ReceiptUncheckedUpdateWithoutAgreementInput>
  }

  export type WebhookUncheckedUpdateManyWithoutAgreementNestedInput = {
    create?: XOR<WebhookCreateWithoutAgreementInput, WebhookUncheckedCreateWithoutAgreementInput> | WebhookCreateWithoutAgreementInput[] | WebhookUncheckedCreateWithoutAgreementInput[]
    connectOrCreate?: WebhookCreateOrConnectWithoutAgreementInput | WebhookCreateOrConnectWithoutAgreementInput[]
    upsert?: WebhookUpsertWithWhereUniqueWithoutAgreementInput | WebhookUpsertWithWhereUniqueWithoutAgreementInput[]
    createMany?: WebhookCreateManyAgreementInputEnvelope
    set?: WebhookWhereUniqueInput | WebhookWhereUniqueInput[]
    disconnect?: WebhookWhereUniqueInput | WebhookWhereUniqueInput[]
    delete?: WebhookWhereUniqueInput | WebhookWhereUniqueInput[]
    connect?: WebhookWhereUniqueInput | WebhookWhereUniqueInput[]
    update?: WebhookUpdateWithWhereUniqueWithoutAgreementInput | WebhookUpdateWithWhereUniqueWithoutAgreementInput[]
    updateMany?: WebhookUpdateManyWithWhereWithoutAgreementInput | WebhookUpdateManyWithWhereWithoutAgreementInput[]
    deleteMany?: WebhookScalarWhereInput | WebhookScalarWhereInput[]
  }

  export type AgreementCreateNestedOneWithoutDepositsInput = {
    create?: XOR<AgreementCreateWithoutDepositsInput, AgreementUncheckedCreateWithoutDepositsInput>
    connectOrCreate?: AgreementCreateOrConnectWithoutDepositsInput
    connect?: AgreementWhereUniqueInput
  }

  export type EnumDepositTypeFieldUpdateOperationsInput = {
    set?: $Enums.DepositType
  }

  export type NullableDecimalFieldUpdateOperationsInput = {
    set?: Decimal | DecimalJsLike | number | string | null
    increment?: Decimal | DecimalJsLike | number | string
    decrement?: Decimal | DecimalJsLike | number | string
    multiply?: Decimal | DecimalJsLike | number | string
    divide?: Decimal | DecimalJsLike | number | string
  }

  export type EnumDepositStatusFieldUpdateOperationsInput = {
    set?: $Enums.DepositStatus
  }

  export type NullableBigIntFieldUpdateOperationsInput = {
    set?: bigint | number | null
    increment?: bigint | number
    decrement?: bigint | number
    multiply?: bigint | number
    divide?: bigint | number
  }

  export type AgreementUpdateOneRequiredWithoutDepositsNestedInput = {
    create?: XOR<AgreementCreateWithoutDepositsInput, AgreementUncheckedCreateWithoutDepositsInput>
    connectOrCreate?: AgreementCreateOrConnectWithoutDepositsInput
    upsert?: AgreementUpsertWithoutDepositsInput
    connect?: AgreementWhereUniqueInput
    update?: XOR<XOR<AgreementUpdateToOneWithWhereWithoutDepositsInput, AgreementUpdateWithoutDepositsInput>, AgreementUncheckedUpdateWithoutDepositsInput>
  }

  export type AgreementCreateNestedOneWithoutSettlementInput = {
    create?: XOR<AgreementCreateWithoutSettlementInput, AgreementUncheckedCreateWithoutSettlementInput>
    connectOrCreate?: AgreementCreateOrConnectWithoutSettlementInput
    connect?: AgreementWhereUniqueInput
  }

  export type BigIntFieldUpdateOperationsInput = {
    set?: bigint | number
    increment?: bigint | number
    decrement?: bigint | number
    multiply?: bigint | number
    divide?: bigint | number
  }

  export type AgreementUpdateOneRequiredWithoutSettlementNestedInput = {
    create?: XOR<AgreementCreateWithoutSettlementInput, AgreementUncheckedCreateWithoutSettlementInput>
    connectOrCreate?: AgreementCreateOrConnectWithoutSettlementInput
    upsert?: AgreementUpsertWithoutSettlementInput
    connect?: AgreementWhereUniqueInput
    update?: XOR<XOR<AgreementUpdateToOneWithWhereWithoutSettlementInput, AgreementUpdateWithoutSettlementInput>, AgreementUncheckedUpdateWithoutSettlementInput>
  }

  export type AgreementCreateNestedOneWithoutReceiptInput = {
    create?: XOR<AgreementCreateWithoutReceiptInput, AgreementUncheckedCreateWithoutReceiptInput>
    connectOrCreate?: AgreementCreateOrConnectWithoutReceiptInput
    connect?: AgreementWhereUniqueInput
  }

  export type AgreementUpdateOneRequiredWithoutReceiptNestedInput = {
    create?: XOR<AgreementCreateWithoutReceiptInput, AgreementUncheckedCreateWithoutReceiptInput>
    connectOrCreate?: AgreementCreateOrConnectWithoutReceiptInput
    upsert?: AgreementUpsertWithoutReceiptInput
    connect?: AgreementWhereUniqueInput
    update?: XOR<XOR<AgreementUpdateToOneWithWhereWithoutReceiptInput, AgreementUpdateWithoutReceiptInput>, AgreementUncheckedUpdateWithoutReceiptInput>
  }

  export type AgreementCreateNestedOneWithoutWebhooksInput = {
    create?: XOR<AgreementCreateWithoutWebhooksInput, AgreementUncheckedCreateWithoutWebhooksInput>
    connectOrCreate?: AgreementCreateOrConnectWithoutWebhooksInput
    connect?: AgreementWhereUniqueInput
  }

  export type EnumWebhookEventTypeFieldUpdateOperationsInput = {
    set?: $Enums.WebhookEventType
  }

  export type EnumWebhookDeliveryStatusFieldUpdateOperationsInput = {
    set?: $Enums.WebhookDeliveryStatus
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type AgreementUpdateOneRequiredWithoutWebhooksNestedInput = {
    create?: XOR<AgreementCreateWithoutWebhooksInput, AgreementUncheckedCreateWithoutWebhooksInput>
    connectOrCreate?: AgreementCreateOrConnectWithoutWebhooksInput
    upsert?: AgreementUpsertWithoutWebhooksInput
    connect?: AgreementWhereUniqueInput
    update?: XOR<XOR<AgreementUpdateToOneWithWhereWithoutWebhooksInput, AgreementUpdateWithoutWebhooksInput>, AgreementUncheckedUpdateWithoutWebhooksInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedDecimalFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedEnumAgreementStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.AgreementStatus | EnumAgreementStatusFieldRefInput<$PrismaModel>
    in?: $Enums.AgreementStatus[] | ListEnumAgreementStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.AgreementStatus[] | ListEnumAgreementStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumAgreementStatusFilter<$PrismaModel> | $Enums.AgreementStatus
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedDecimalWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalWithAggregatesFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedDecimalFilter<$PrismaModel>
    _sum?: NestedDecimalFilter<$PrismaModel>
    _min?: NestedDecimalFilter<$PrismaModel>
    _max?: NestedDecimalFilter<$PrismaModel>
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedEnumAgreementStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.AgreementStatus | EnumAgreementStatusFieldRefInput<$PrismaModel>
    in?: $Enums.AgreementStatus[] | ListEnumAgreementStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.AgreementStatus[] | ListEnumAgreementStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumAgreementStatusWithAggregatesFilter<$PrismaModel> | $Enums.AgreementStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumAgreementStatusFilter<$PrismaModel>
    _max?: NestedEnumAgreementStatusFilter<$PrismaModel>
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedEnumDepositTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositType | EnumDepositTypeFieldRefInput<$PrismaModel>
    in?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumDepositTypeFilter<$PrismaModel> | $Enums.DepositType
  }

  export type NestedDecimalNullableFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel> | null
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalNullableFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string | null
  }

  export type NestedEnumDepositStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositStatus | EnumDepositStatusFieldRefInput<$PrismaModel>
    in?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumDepositStatusFilter<$PrismaModel> | $Enums.DepositStatus
  }

  export type NestedBigIntNullableFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel> | null
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel> | null
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel> | null
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntNullableFilter<$PrismaModel> | bigint | number | null
  }

  export type NestedEnumDepositTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositType | EnumDepositTypeFieldRefInput<$PrismaModel>
    in?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumDepositTypeWithAggregatesFilter<$PrismaModel> | $Enums.DepositType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumDepositTypeFilter<$PrismaModel>
    _max?: NestedEnumDepositTypeFilter<$PrismaModel>
  }

  export type NestedDecimalNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel> | null
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalNullableWithAggregatesFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedDecimalNullableFilter<$PrismaModel>
    _sum?: NestedDecimalNullableFilter<$PrismaModel>
    _min?: NestedDecimalNullableFilter<$PrismaModel>
    _max?: NestedDecimalNullableFilter<$PrismaModel>
  }

  export type NestedEnumDepositStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositStatus | EnumDepositStatusFieldRefInput<$PrismaModel>
    in?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumDepositStatusWithAggregatesFilter<$PrismaModel> | $Enums.DepositStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumDepositStatusFilter<$PrismaModel>
    _max?: NestedEnumDepositStatusFilter<$PrismaModel>
  }

  export type NestedBigIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel> | null
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel> | null
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel> | null
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntNullableWithAggregatesFilter<$PrismaModel> | bigint | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedBigIntNullableFilter<$PrismaModel>
    _min?: NestedBigIntNullableFilter<$PrismaModel>
    _max?: NestedBigIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }
  export type NestedJsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }
  export type NestedJsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedBigIntFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntFilter<$PrismaModel> | bigint | number
  }

  export type NestedBigIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntWithAggregatesFilter<$PrismaModel> | bigint | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedBigIntFilter<$PrismaModel>
    _min?: NestedBigIntFilter<$PrismaModel>
    _max?: NestedBigIntFilter<$PrismaModel>
  }

  export type NestedEnumWebhookEventTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.WebhookEventType | EnumWebhookEventTypeFieldRefInput<$PrismaModel>
    in?: $Enums.WebhookEventType[] | ListEnumWebhookEventTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.WebhookEventType[] | ListEnumWebhookEventTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumWebhookEventTypeFilter<$PrismaModel> | $Enums.WebhookEventType
  }

  export type NestedEnumWebhookDeliveryStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.WebhookDeliveryStatus | EnumWebhookDeliveryStatusFieldRefInput<$PrismaModel>
    in?: $Enums.WebhookDeliveryStatus[] | ListEnumWebhookDeliveryStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.WebhookDeliveryStatus[] | ListEnumWebhookDeliveryStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumWebhookDeliveryStatusFilter<$PrismaModel> | $Enums.WebhookDeliveryStatus
  }

  export type NestedEnumWebhookEventTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.WebhookEventType | EnumWebhookEventTypeFieldRefInput<$PrismaModel>
    in?: $Enums.WebhookEventType[] | ListEnumWebhookEventTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.WebhookEventType[] | ListEnumWebhookEventTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumWebhookEventTypeWithAggregatesFilter<$PrismaModel> | $Enums.WebhookEventType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumWebhookEventTypeFilter<$PrismaModel>
    _max?: NestedEnumWebhookEventTypeFilter<$PrismaModel>
  }

  export type NestedEnumWebhookDeliveryStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.WebhookDeliveryStatus | EnumWebhookDeliveryStatusFieldRefInput<$PrismaModel>
    in?: $Enums.WebhookDeliveryStatus[] | ListEnumWebhookDeliveryStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.WebhookDeliveryStatus[] | ListEnumWebhookDeliveryStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumWebhookDeliveryStatusWithAggregatesFilter<$PrismaModel> | $Enums.WebhookDeliveryStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumWebhookDeliveryStatusFilter<$PrismaModel>
    _max?: NestedEnumWebhookDeliveryStatusFilter<$PrismaModel>
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type DepositCreateWithoutAgreementInput = {
    id?: string
    type: $Enums.DepositType
    depositor: string
    amount?: Decimal | DecimalJsLike | number | string | null
    tokenAccount?: string | null
    status?: $Enums.DepositStatus
    txId?: string | null
    blockHeight?: bigint | number | null
    nftMetadata?: NullableJsonNullValueInput | InputJsonValue
    detectedAt?: Date | string
    confirmedAt?: Date | string | null
  }

  export type DepositUncheckedCreateWithoutAgreementInput = {
    id?: string
    type: $Enums.DepositType
    depositor: string
    amount?: Decimal | DecimalJsLike | number | string | null
    tokenAccount?: string | null
    status?: $Enums.DepositStatus
    txId?: string | null
    blockHeight?: bigint | number | null
    nftMetadata?: NullableJsonNullValueInput | InputJsonValue
    detectedAt?: Date | string
    confirmedAt?: Date | string | null
  }

  export type DepositCreateOrConnectWithoutAgreementInput = {
    where: DepositWhereUniqueInput
    create: XOR<DepositCreateWithoutAgreementInput, DepositUncheckedCreateWithoutAgreementInput>
  }

  export type DepositCreateManyAgreementInputEnvelope = {
    data: DepositCreateManyAgreementInput | DepositCreateManyAgreementInput[]
    skipDuplicates?: boolean
  }

  export type SettlementCreateWithoutAgreementInput = {
    id?: string
    nftMint: string
    price: Decimal | DecimalJsLike | number | string
    platformFee: Decimal | DecimalJsLike | number | string
    creatorRoyalty?: Decimal | DecimalJsLike | number | string | null
    sellerReceived: Decimal | DecimalJsLike | number | string
    settleTxId: string
    blockHeight: bigint | number
    buyer: string
    seller: string
    feeCollector?: string | null
    royaltyRecipient?: string | null
    settledAt?: Date | string
  }

  export type SettlementUncheckedCreateWithoutAgreementInput = {
    id?: string
    nftMint: string
    price: Decimal | DecimalJsLike | number | string
    platformFee: Decimal | DecimalJsLike | number | string
    creatorRoyalty?: Decimal | DecimalJsLike | number | string | null
    sellerReceived: Decimal | DecimalJsLike | number | string
    settleTxId: string
    blockHeight: bigint | number
    buyer: string
    seller: string
    feeCollector?: string | null
    royaltyRecipient?: string | null
    settledAt?: Date | string
  }

  export type SettlementCreateOrConnectWithoutAgreementInput = {
    where: SettlementWhereUniqueInput
    create: XOR<SettlementCreateWithoutAgreementInput, SettlementUncheckedCreateWithoutAgreementInput>
  }

  export type ReceiptCreateWithoutAgreementInput = {
    id?: string
    nftMint: string
    price: Decimal | DecimalJsLike | number | string
    platformFee: Decimal | DecimalJsLike | number | string
    creatorRoyalty?: Decimal | DecimalJsLike | number | string | null
    buyer: string
    seller: string
    escrowTxId: string
    settlementTxId: string
    receiptHash: string
    signature: string
    createdAt: Date | string
    settledAt: Date | string
    generatedAt?: Date | string
  }

  export type ReceiptUncheckedCreateWithoutAgreementInput = {
    id?: string
    nftMint: string
    price: Decimal | DecimalJsLike | number | string
    platformFee: Decimal | DecimalJsLike | number | string
    creatorRoyalty?: Decimal | DecimalJsLike | number | string | null
    buyer: string
    seller: string
    escrowTxId: string
    settlementTxId: string
    receiptHash: string
    signature: string
    createdAt: Date | string
    settledAt: Date | string
    generatedAt?: Date | string
  }

  export type ReceiptCreateOrConnectWithoutAgreementInput = {
    where: ReceiptWhereUniqueInput
    create: XOR<ReceiptCreateWithoutAgreementInput, ReceiptUncheckedCreateWithoutAgreementInput>
  }

  export type WebhookCreateWithoutAgreementInput = {
    id?: string
    eventType: $Enums.WebhookEventType
    targetUrl: string
    payload: JsonNullValueInput | InputJsonValue
    status?: $Enums.WebhookDeliveryStatus
    attempts?: number
    maxAttempts?: number
    lastAttemptAt?: Date | string | null
    lastResponseCode?: number | null
    lastResponseBody?: string | null
    deliveredAt?: Date | string | null
    signature?: string | null
    createdAt?: Date | string
    scheduledFor?: Date | string
  }

  export type WebhookUncheckedCreateWithoutAgreementInput = {
    id?: string
    eventType: $Enums.WebhookEventType
    targetUrl: string
    payload: JsonNullValueInput | InputJsonValue
    status?: $Enums.WebhookDeliveryStatus
    attempts?: number
    maxAttempts?: number
    lastAttemptAt?: Date | string | null
    lastResponseCode?: number | null
    lastResponseBody?: string | null
    deliveredAt?: Date | string | null
    signature?: string | null
    createdAt?: Date | string
    scheduledFor?: Date | string
  }

  export type WebhookCreateOrConnectWithoutAgreementInput = {
    where: WebhookWhereUniqueInput
    create: XOR<WebhookCreateWithoutAgreementInput, WebhookUncheckedCreateWithoutAgreementInput>
  }

  export type WebhookCreateManyAgreementInputEnvelope = {
    data: WebhookCreateManyAgreementInput | WebhookCreateManyAgreementInput[]
    skipDuplicates?: boolean
  }

  export type DepositUpsertWithWhereUniqueWithoutAgreementInput = {
    where: DepositWhereUniqueInput
    update: XOR<DepositUpdateWithoutAgreementInput, DepositUncheckedUpdateWithoutAgreementInput>
    create: XOR<DepositCreateWithoutAgreementInput, DepositUncheckedCreateWithoutAgreementInput>
  }

  export type DepositUpdateWithWhereUniqueWithoutAgreementInput = {
    where: DepositWhereUniqueInput
    data: XOR<DepositUpdateWithoutAgreementInput, DepositUncheckedUpdateWithoutAgreementInput>
  }

  export type DepositUpdateManyWithWhereWithoutAgreementInput = {
    where: DepositScalarWhereInput
    data: XOR<DepositUpdateManyMutationInput, DepositUncheckedUpdateManyWithoutAgreementInput>
  }

  export type DepositScalarWhereInput = {
    AND?: DepositScalarWhereInput | DepositScalarWhereInput[]
    OR?: DepositScalarWhereInput[]
    NOT?: DepositScalarWhereInput | DepositScalarWhereInput[]
    id?: StringFilter<"Deposit"> | string
    agreementId?: StringFilter<"Deposit"> | string
    type?: EnumDepositTypeFilter<"Deposit"> | $Enums.DepositType
    depositor?: StringFilter<"Deposit"> | string
    amount?: DecimalNullableFilter<"Deposit"> | Decimal | DecimalJsLike | number | string | null
    tokenAccount?: StringNullableFilter<"Deposit"> | string | null
    status?: EnumDepositStatusFilter<"Deposit"> | $Enums.DepositStatus
    txId?: StringNullableFilter<"Deposit"> | string | null
    blockHeight?: BigIntNullableFilter<"Deposit"> | bigint | number | null
    nftMetadata?: JsonNullableFilter<"Deposit">
    detectedAt?: DateTimeFilter<"Deposit"> | Date | string
    confirmedAt?: DateTimeNullableFilter<"Deposit"> | Date | string | null
  }

  export type SettlementUpsertWithoutAgreementInput = {
    update: XOR<SettlementUpdateWithoutAgreementInput, SettlementUncheckedUpdateWithoutAgreementInput>
    create: XOR<SettlementCreateWithoutAgreementInput, SettlementUncheckedCreateWithoutAgreementInput>
    where?: SettlementWhereInput
  }

  export type SettlementUpdateToOneWithWhereWithoutAgreementInput = {
    where?: SettlementWhereInput
    data: XOR<SettlementUpdateWithoutAgreementInput, SettlementUncheckedUpdateWithoutAgreementInput>
  }

  export type SettlementUpdateWithoutAgreementInput = {
    id?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    sellerReceived?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    settleTxId?: StringFieldUpdateOperationsInput | string
    blockHeight?: BigIntFieldUpdateOperationsInput | bigint | number
    buyer?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    feeCollector?: NullableStringFieldUpdateOperationsInput | string | null
    royaltyRecipient?: NullableStringFieldUpdateOperationsInput | string | null
    settledAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SettlementUncheckedUpdateWithoutAgreementInput = {
    id?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    sellerReceived?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    settleTxId?: StringFieldUpdateOperationsInput | string
    blockHeight?: BigIntFieldUpdateOperationsInput | bigint | number
    buyer?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    feeCollector?: NullableStringFieldUpdateOperationsInput | string | null
    royaltyRecipient?: NullableStringFieldUpdateOperationsInput | string | null
    settledAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReceiptUpsertWithoutAgreementInput = {
    update: XOR<ReceiptUpdateWithoutAgreementInput, ReceiptUncheckedUpdateWithoutAgreementInput>
    create: XOR<ReceiptCreateWithoutAgreementInput, ReceiptUncheckedCreateWithoutAgreementInput>
    where?: ReceiptWhereInput
  }

  export type ReceiptUpdateToOneWithWhereWithoutAgreementInput = {
    where?: ReceiptWhereInput
    data: XOR<ReceiptUpdateWithoutAgreementInput, ReceiptUncheckedUpdateWithoutAgreementInput>
  }

  export type ReceiptUpdateWithoutAgreementInput = {
    id?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    buyer?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    escrowTxId?: StringFieldUpdateOperationsInput | string
    settlementTxId?: StringFieldUpdateOperationsInput | string
    receiptHash?: StringFieldUpdateOperationsInput | string
    signature?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReceiptUncheckedUpdateWithoutAgreementInput = {
    id?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    platformFee?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    creatorRoyalty?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    buyer?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    escrowTxId?: StringFieldUpdateOperationsInput | string
    settlementTxId?: StringFieldUpdateOperationsInput | string
    receiptHash?: StringFieldUpdateOperationsInput | string
    signature?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WebhookUpsertWithWhereUniqueWithoutAgreementInput = {
    where: WebhookWhereUniqueInput
    update: XOR<WebhookUpdateWithoutAgreementInput, WebhookUncheckedUpdateWithoutAgreementInput>
    create: XOR<WebhookCreateWithoutAgreementInput, WebhookUncheckedCreateWithoutAgreementInput>
  }

  export type WebhookUpdateWithWhereUniqueWithoutAgreementInput = {
    where: WebhookWhereUniqueInput
    data: XOR<WebhookUpdateWithoutAgreementInput, WebhookUncheckedUpdateWithoutAgreementInput>
  }

  export type WebhookUpdateManyWithWhereWithoutAgreementInput = {
    where: WebhookScalarWhereInput
    data: XOR<WebhookUpdateManyMutationInput, WebhookUncheckedUpdateManyWithoutAgreementInput>
  }

  export type WebhookScalarWhereInput = {
    AND?: WebhookScalarWhereInput | WebhookScalarWhereInput[]
    OR?: WebhookScalarWhereInput[]
    NOT?: WebhookScalarWhereInput | WebhookScalarWhereInput[]
    id?: StringFilter<"Webhook"> | string
    agreementId?: StringFilter<"Webhook"> | string
    eventType?: EnumWebhookEventTypeFilter<"Webhook"> | $Enums.WebhookEventType
    targetUrl?: StringFilter<"Webhook"> | string
    payload?: JsonFilter<"Webhook">
    status?: EnumWebhookDeliveryStatusFilter<"Webhook"> | $Enums.WebhookDeliveryStatus
    attempts?: IntFilter<"Webhook"> | number
    maxAttempts?: IntFilter<"Webhook"> | number
    lastAttemptAt?: DateTimeNullableFilter<"Webhook"> | Date | string | null
    lastResponseCode?: IntNullableFilter<"Webhook"> | number | null
    lastResponseBody?: StringNullableFilter<"Webhook"> | string | null
    deliveredAt?: DateTimeNullableFilter<"Webhook"> | Date | string | null
    signature?: StringNullableFilter<"Webhook"> | string | null
    createdAt?: DateTimeFilter<"Webhook"> | Date | string
    scheduledFor?: DateTimeFilter<"Webhook"> | Date | string
  }

  export type AgreementCreateWithoutDepositsInput = {
    id?: string
    agreementId: string
    escrowPda: string
    nftMint: string
    seller: string
    buyer?: string | null
    price: Decimal | DecimalJsLike | number | string
    feeBps: number
    honorRoyalties?: boolean
    status?: $Enums.AgreementStatus
    expiry: Date | string
    usdcDepositAddr?: string | null
    nftDepositAddr?: string | null
    initTxId?: string | null
    settleTxId?: string | null
    cancelTxId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    settledAt?: Date | string | null
    cancelledAt?: Date | string | null
    settlement?: SettlementCreateNestedOneWithoutAgreementInput
    receipt?: ReceiptCreateNestedOneWithoutAgreementInput
    webhooks?: WebhookCreateNestedManyWithoutAgreementInput
  }

  export type AgreementUncheckedCreateWithoutDepositsInput = {
    id?: string
    agreementId: string
    escrowPda: string
    nftMint: string
    seller: string
    buyer?: string | null
    price: Decimal | DecimalJsLike | number | string
    feeBps: number
    honorRoyalties?: boolean
    status?: $Enums.AgreementStatus
    expiry: Date | string
    usdcDepositAddr?: string | null
    nftDepositAddr?: string | null
    initTxId?: string | null
    settleTxId?: string | null
    cancelTxId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    settledAt?: Date | string | null
    cancelledAt?: Date | string | null
    settlement?: SettlementUncheckedCreateNestedOneWithoutAgreementInput
    receipt?: ReceiptUncheckedCreateNestedOneWithoutAgreementInput
    webhooks?: WebhookUncheckedCreateNestedManyWithoutAgreementInput
  }

  export type AgreementCreateOrConnectWithoutDepositsInput = {
    where: AgreementWhereUniqueInput
    create: XOR<AgreementCreateWithoutDepositsInput, AgreementUncheckedCreateWithoutDepositsInput>
  }

  export type AgreementUpsertWithoutDepositsInput = {
    update: XOR<AgreementUpdateWithoutDepositsInput, AgreementUncheckedUpdateWithoutDepositsInput>
    create: XOR<AgreementCreateWithoutDepositsInput, AgreementUncheckedCreateWithoutDepositsInput>
    where?: AgreementWhereInput
  }

  export type AgreementUpdateToOneWithWhereWithoutDepositsInput = {
    where?: AgreementWhereInput
    data: XOR<AgreementUpdateWithoutDepositsInput, AgreementUncheckedUpdateWithoutDepositsInput>
  }

  export type AgreementUpdateWithoutDepositsInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    escrowPda?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    buyer?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    feeBps?: IntFieldUpdateOperationsInput | number
    honorRoyalties?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAgreementStatusFieldUpdateOperationsInput | $Enums.AgreementStatus
    expiry?: DateTimeFieldUpdateOperationsInput | Date | string
    usdcDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    nftDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    initTxId?: NullableStringFieldUpdateOperationsInput | string | null
    settleTxId?: NullableStringFieldUpdateOperationsInput | string | null
    cancelTxId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cancelledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    settlement?: SettlementUpdateOneWithoutAgreementNestedInput
    receipt?: ReceiptUpdateOneWithoutAgreementNestedInput
    webhooks?: WebhookUpdateManyWithoutAgreementNestedInput
  }

  export type AgreementUncheckedUpdateWithoutDepositsInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    escrowPda?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    buyer?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    feeBps?: IntFieldUpdateOperationsInput | number
    honorRoyalties?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAgreementStatusFieldUpdateOperationsInput | $Enums.AgreementStatus
    expiry?: DateTimeFieldUpdateOperationsInput | Date | string
    usdcDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    nftDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    initTxId?: NullableStringFieldUpdateOperationsInput | string | null
    settleTxId?: NullableStringFieldUpdateOperationsInput | string | null
    cancelTxId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cancelledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    settlement?: SettlementUncheckedUpdateOneWithoutAgreementNestedInput
    receipt?: ReceiptUncheckedUpdateOneWithoutAgreementNestedInput
    webhooks?: WebhookUncheckedUpdateManyWithoutAgreementNestedInput
  }

  export type AgreementCreateWithoutSettlementInput = {
    id?: string
    agreementId: string
    escrowPda: string
    nftMint: string
    seller: string
    buyer?: string | null
    price: Decimal | DecimalJsLike | number | string
    feeBps: number
    honorRoyalties?: boolean
    status?: $Enums.AgreementStatus
    expiry: Date | string
    usdcDepositAddr?: string | null
    nftDepositAddr?: string | null
    initTxId?: string | null
    settleTxId?: string | null
    cancelTxId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    settledAt?: Date | string | null
    cancelledAt?: Date | string | null
    deposits?: DepositCreateNestedManyWithoutAgreementInput
    receipt?: ReceiptCreateNestedOneWithoutAgreementInput
    webhooks?: WebhookCreateNestedManyWithoutAgreementInput
  }

  export type AgreementUncheckedCreateWithoutSettlementInput = {
    id?: string
    agreementId: string
    escrowPda: string
    nftMint: string
    seller: string
    buyer?: string | null
    price: Decimal | DecimalJsLike | number | string
    feeBps: number
    honorRoyalties?: boolean
    status?: $Enums.AgreementStatus
    expiry: Date | string
    usdcDepositAddr?: string | null
    nftDepositAddr?: string | null
    initTxId?: string | null
    settleTxId?: string | null
    cancelTxId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    settledAt?: Date | string | null
    cancelledAt?: Date | string | null
    deposits?: DepositUncheckedCreateNestedManyWithoutAgreementInput
    receipt?: ReceiptUncheckedCreateNestedOneWithoutAgreementInput
    webhooks?: WebhookUncheckedCreateNestedManyWithoutAgreementInput
  }

  export type AgreementCreateOrConnectWithoutSettlementInput = {
    where: AgreementWhereUniqueInput
    create: XOR<AgreementCreateWithoutSettlementInput, AgreementUncheckedCreateWithoutSettlementInput>
  }

  export type AgreementUpsertWithoutSettlementInput = {
    update: XOR<AgreementUpdateWithoutSettlementInput, AgreementUncheckedUpdateWithoutSettlementInput>
    create: XOR<AgreementCreateWithoutSettlementInput, AgreementUncheckedCreateWithoutSettlementInput>
    where?: AgreementWhereInput
  }

  export type AgreementUpdateToOneWithWhereWithoutSettlementInput = {
    where?: AgreementWhereInput
    data: XOR<AgreementUpdateWithoutSettlementInput, AgreementUncheckedUpdateWithoutSettlementInput>
  }

  export type AgreementUpdateWithoutSettlementInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    escrowPda?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    buyer?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    feeBps?: IntFieldUpdateOperationsInput | number
    honorRoyalties?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAgreementStatusFieldUpdateOperationsInput | $Enums.AgreementStatus
    expiry?: DateTimeFieldUpdateOperationsInput | Date | string
    usdcDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    nftDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    initTxId?: NullableStringFieldUpdateOperationsInput | string | null
    settleTxId?: NullableStringFieldUpdateOperationsInput | string | null
    cancelTxId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cancelledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    deposits?: DepositUpdateManyWithoutAgreementNestedInput
    receipt?: ReceiptUpdateOneWithoutAgreementNestedInput
    webhooks?: WebhookUpdateManyWithoutAgreementNestedInput
  }

  export type AgreementUncheckedUpdateWithoutSettlementInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    escrowPda?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    buyer?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    feeBps?: IntFieldUpdateOperationsInput | number
    honorRoyalties?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAgreementStatusFieldUpdateOperationsInput | $Enums.AgreementStatus
    expiry?: DateTimeFieldUpdateOperationsInput | Date | string
    usdcDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    nftDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    initTxId?: NullableStringFieldUpdateOperationsInput | string | null
    settleTxId?: NullableStringFieldUpdateOperationsInput | string | null
    cancelTxId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cancelledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    deposits?: DepositUncheckedUpdateManyWithoutAgreementNestedInput
    receipt?: ReceiptUncheckedUpdateOneWithoutAgreementNestedInput
    webhooks?: WebhookUncheckedUpdateManyWithoutAgreementNestedInput
  }

  export type AgreementCreateWithoutReceiptInput = {
    id?: string
    agreementId: string
    escrowPda: string
    nftMint: string
    seller: string
    buyer?: string | null
    price: Decimal | DecimalJsLike | number | string
    feeBps: number
    honorRoyalties?: boolean
    status?: $Enums.AgreementStatus
    expiry: Date | string
    usdcDepositAddr?: string | null
    nftDepositAddr?: string | null
    initTxId?: string | null
    settleTxId?: string | null
    cancelTxId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    settledAt?: Date | string | null
    cancelledAt?: Date | string | null
    deposits?: DepositCreateNestedManyWithoutAgreementInput
    settlement?: SettlementCreateNestedOneWithoutAgreementInput
    webhooks?: WebhookCreateNestedManyWithoutAgreementInput
  }

  export type AgreementUncheckedCreateWithoutReceiptInput = {
    id?: string
    agreementId: string
    escrowPda: string
    nftMint: string
    seller: string
    buyer?: string | null
    price: Decimal | DecimalJsLike | number | string
    feeBps: number
    honorRoyalties?: boolean
    status?: $Enums.AgreementStatus
    expiry: Date | string
    usdcDepositAddr?: string | null
    nftDepositAddr?: string | null
    initTxId?: string | null
    settleTxId?: string | null
    cancelTxId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    settledAt?: Date | string | null
    cancelledAt?: Date | string | null
    deposits?: DepositUncheckedCreateNestedManyWithoutAgreementInput
    settlement?: SettlementUncheckedCreateNestedOneWithoutAgreementInput
    webhooks?: WebhookUncheckedCreateNestedManyWithoutAgreementInput
  }

  export type AgreementCreateOrConnectWithoutReceiptInput = {
    where: AgreementWhereUniqueInput
    create: XOR<AgreementCreateWithoutReceiptInput, AgreementUncheckedCreateWithoutReceiptInput>
  }

  export type AgreementUpsertWithoutReceiptInput = {
    update: XOR<AgreementUpdateWithoutReceiptInput, AgreementUncheckedUpdateWithoutReceiptInput>
    create: XOR<AgreementCreateWithoutReceiptInput, AgreementUncheckedCreateWithoutReceiptInput>
    where?: AgreementWhereInput
  }

  export type AgreementUpdateToOneWithWhereWithoutReceiptInput = {
    where?: AgreementWhereInput
    data: XOR<AgreementUpdateWithoutReceiptInput, AgreementUncheckedUpdateWithoutReceiptInput>
  }

  export type AgreementUpdateWithoutReceiptInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    escrowPda?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    buyer?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    feeBps?: IntFieldUpdateOperationsInput | number
    honorRoyalties?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAgreementStatusFieldUpdateOperationsInput | $Enums.AgreementStatus
    expiry?: DateTimeFieldUpdateOperationsInput | Date | string
    usdcDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    nftDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    initTxId?: NullableStringFieldUpdateOperationsInput | string | null
    settleTxId?: NullableStringFieldUpdateOperationsInput | string | null
    cancelTxId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cancelledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    deposits?: DepositUpdateManyWithoutAgreementNestedInput
    settlement?: SettlementUpdateOneWithoutAgreementNestedInput
    webhooks?: WebhookUpdateManyWithoutAgreementNestedInput
  }

  export type AgreementUncheckedUpdateWithoutReceiptInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    escrowPda?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    buyer?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    feeBps?: IntFieldUpdateOperationsInput | number
    honorRoyalties?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAgreementStatusFieldUpdateOperationsInput | $Enums.AgreementStatus
    expiry?: DateTimeFieldUpdateOperationsInput | Date | string
    usdcDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    nftDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    initTxId?: NullableStringFieldUpdateOperationsInput | string | null
    settleTxId?: NullableStringFieldUpdateOperationsInput | string | null
    cancelTxId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cancelledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    deposits?: DepositUncheckedUpdateManyWithoutAgreementNestedInput
    settlement?: SettlementUncheckedUpdateOneWithoutAgreementNestedInput
    webhooks?: WebhookUncheckedUpdateManyWithoutAgreementNestedInput
  }

  export type AgreementCreateWithoutWebhooksInput = {
    id?: string
    agreementId: string
    escrowPda: string
    nftMint: string
    seller: string
    buyer?: string | null
    price: Decimal | DecimalJsLike | number | string
    feeBps: number
    honorRoyalties?: boolean
    status?: $Enums.AgreementStatus
    expiry: Date | string
    usdcDepositAddr?: string | null
    nftDepositAddr?: string | null
    initTxId?: string | null
    settleTxId?: string | null
    cancelTxId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    settledAt?: Date | string | null
    cancelledAt?: Date | string | null
    deposits?: DepositCreateNestedManyWithoutAgreementInput
    settlement?: SettlementCreateNestedOneWithoutAgreementInput
    receipt?: ReceiptCreateNestedOneWithoutAgreementInput
  }

  export type AgreementUncheckedCreateWithoutWebhooksInput = {
    id?: string
    agreementId: string
    escrowPda: string
    nftMint: string
    seller: string
    buyer?: string | null
    price: Decimal | DecimalJsLike | number | string
    feeBps: number
    honorRoyalties?: boolean
    status?: $Enums.AgreementStatus
    expiry: Date | string
    usdcDepositAddr?: string | null
    nftDepositAddr?: string | null
    initTxId?: string | null
    settleTxId?: string | null
    cancelTxId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    settledAt?: Date | string | null
    cancelledAt?: Date | string | null
    deposits?: DepositUncheckedCreateNestedManyWithoutAgreementInput
    settlement?: SettlementUncheckedCreateNestedOneWithoutAgreementInput
    receipt?: ReceiptUncheckedCreateNestedOneWithoutAgreementInput
  }

  export type AgreementCreateOrConnectWithoutWebhooksInput = {
    where: AgreementWhereUniqueInput
    create: XOR<AgreementCreateWithoutWebhooksInput, AgreementUncheckedCreateWithoutWebhooksInput>
  }

  export type AgreementUpsertWithoutWebhooksInput = {
    update: XOR<AgreementUpdateWithoutWebhooksInput, AgreementUncheckedUpdateWithoutWebhooksInput>
    create: XOR<AgreementCreateWithoutWebhooksInput, AgreementUncheckedCreateWithoutWebhooksInput>
    where?: AgreementWhereInput
  }

  export type AgreementUpdateToOneWithWhereWithoutWebhooksInput = {
    where?: AgreementWhereInput
    data: XOR<AgreementUpdateWithoutWebhooksInput, AgreementUncheckedUpdateWithoutWebhooksInput>
  }

  export type AgreementUpdateWithoutWebhooksInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    escrowPda?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    buyer?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    feeBps?: IntFieldUpdateOperationsInput | number
    honorRoyalties?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAgreementStatusFieldUpdateOperationsInput | $Enums.AgreementStatus
    expiry?: DateTimeFieldUpdateOperationsInput | Date | string
    usdcDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    nftDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    initTxId?: NullableStringFieldUpdateOperationsInput | string | null
    settleTxId?: NullableStringFieldUpdateOperationsInput | string | null
    cancelTxId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cancelledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    deposits?: DepositUpdateManyWithoutAgreementNestedInput
    settlement?: SettlementUpdateOneWithoutAgreementNestedInput
    receipt?: ReceiptUpdateOneWithoutAgreementNestedInput
  }

  export type AgreementUncheckedUpdateWithoutWebhooksInput = {
    id?: StringFieldUpdateOperationsInput | string
    agreementId?: StringFieldUpdateOperationsInput | string
    escrowPda?: StringFieldUpdateOperationsInput | string
    nftMint?: StringFieldUpdateOperationsInput | string
    seller?: StringFieldUpdateOperationsInput | string
    buyer?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    feeBps?: IntFieldUpdateOperationsInput | number
    honorRoyalties?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAgreementStatusFieldUpdateOperationsInput | $Enums.AgreementStatus
    expiry?: DateTimeFieldUpdateOperationsInput | Date | string
    usdcDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    nftDepositAddr?: NullableStringFieldUpdateOperationsInput | string | null
    initTxId?: NullableStringFieldUpdateOperationsInput | string | null
    settleTxId?: NullableStringFieldUpdateOperationsInput | string | null
    cancelTxId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    settledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cancelledAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    deposits?: DepositUncheckedUpdateManyWithoutAgreementNestedInput
    settlement?: SettlementUncheckedUpdateOneWithoutAgreementNestedInput
    receipt?: ReceiptUncheckedUpdateOneWithoutAgreementNestedInput
  }

  export type DepositCreateManyAgreementInput = {
    id?: string
    type: $Enums.DepositType
    depositor: string
    amount?: Decimal | DecimalJsLike | number | string | null
    tokenAccount?: string | null
    status?: $Enums.DepositStatus
    txId?: string | null
    blockHeight?: bigint | number | null
    nftMetadata?: NullableJsonNullValueInput | InputJsonValue
    detectedAt?: Date | string
    confirmedAt?: Date | string | null
  }

  export type WebhookCreateManyAgreementInput = {
    id?: string
    eventType: $Enums.WebhookEventType
    targetUrl: string
    payload: JsonNullValueInput | InputJsonValue
    status?: $Enums.WebhookDeliveryStatus
    attempts?: number
    maxAttempts?: number
    lastAttemptAt?: Date | string | null
    lastResponseCode?: number | null
    lastResponseBody?: string | null
    deliveredAt?: Date | string | null
    signature?: string | null
    createdAt?: Date | string
    scheduledFor?: Date | string
  }

  export type DepositUpdateWithoutAgreementInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType
    depositor?: StringFieldUpdateOperationsInput | string
    amount?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    tokenAccount?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumDepositStatusFieldUpdateOperationsInput | $Enums.DepositStatus
    txId?: NullableStringFieldUpdateOperationsInput | string | null
    blockHeight?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    nftMetadata?: NullableJsonNullValueInput | InputJsonValue
    detectedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    confirmedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type DepositUncheckedUpdateWithoutAgreementInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType
    depositor?: StringFieldUpdateOperationsInput | string
    amount?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    tokenAccount?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumDepositStatusFieldUpdateOperationsInput | $Enums.DepositStatus
    txId?: NullableStringFieldUpdateOperationsInput | string | null
    blockHeight?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    nftMetadata?: NullableJsonNullValueInput | InputJsonValue
    detectedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    confirmedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type DepositUncheckedUpdateManyWithoutAgreementInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType
    depositor?: StringFieldUpdateOperationsInput | string
    amount?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    tokenAccount?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumDepositStatusFieldUpdateOperationsInput | $Enums.DepositStatus
    txId?: NullableStringFieldUpdateOperationsInput | string | null
    blockHeight?: NullableBigIntFieldUpdateOperationsInput | bigint | number | null
    nftMetadata?: NullableJsonNullValueInput | InputJsonValue
    detectedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    confirmedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type WebhookUpdateWithoutAgreementInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventType?: EnumWebhookEventTypeFieldUpdateOperationsInput | $Enums.WebhookEventType
    targetUrl?: StringFieldUpdateOperationsInput | string
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumWebhookDeliveryStatusFieldUpdateOperationsInput | $Enums.WebhookDeliveryStatus
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    lastAttemptAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastResponseCode?: NullableIntFieldUpdateOperationsInput | number | null
    lastResponseBody?: NullableStringFieldUpdateOperationsInput | string | null
    deliveredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    signature?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    scheduledFor?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WebhookUncheckedUpdateWithoutAgreementInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventType?: EnumWebhookEventTypeFieldUpdateOperationsInput | $Enums.WebhookEventType
    targetUrl?: StringFieldUpdateOperationsInput | string
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumWebhookDeliveryStatusFieldUpdateOperationsInput | $Enums.WebhookDeliveryStatus
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    lastAttemptAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastResponseCode?: NullableIntFieldUpdateOperationsInput | number | null
    lastResponseBody?: NullableStringFieldUpdateOperationsInput | string | null
    deliveredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    signature?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    scheduledFor?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WebhookUncheckedUpdateManyWithoutAgreementInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventType?: EnumWebhookEventTypeFieldUpdateOperationsInput | $Enums.WebhookEventType
    targetUrl?: StringFieldUpdateOperationsInput | string
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumWebhookDeliveryStatusFieldUpdateOperationsInput | $Enums.WebhookDeliveryStatus
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    lastAttemptAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastResponseCode?: NullableIntFieldUpdateOperationsInput | number | null
    lastResponseBody?: NullableStringFieldUpdateOperationsInput | string | null
    deliveredAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    signature?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    scheduledFor?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}