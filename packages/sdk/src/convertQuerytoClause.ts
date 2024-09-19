import * as torii from "@dojoengine/torii-client";
import { SchemaType, QueryType, SubscriptionQueryType } from "./types";
import { convertQueryToKeysClause } from "./convertQueryToEntityKeyClauses";

/**
 * Converts a query object into a Torii clause.
 *
 * @template T - The schema type.
 * @param {QueryType<T>} query - The query object to convert.
 * @param {torii.LogicalOperator} [operator="And"] - The logical operator to combine clauses. Default is "And".
 * @returns {torii.Clause} - The resulting Torii clause.
 *
 * @example
 * const query = {
 *     users: {
 *         age: {
 *             $: {
 *                 where: {
 *                     $gt: 18
 *                 }
 *             }
 *         }
 *     }
 * };
 * const clause = convertQueryToClause(query);
 * console.log(clause);
 */
export function convertQueryToClause<T extends SchemaType>(
    query: QueryType<T>,
    schema: T
): torii.Clause {
    const clauses: torii.Clause[] = [];

    for (const [namespace, models] of Object.entries(query)) {
        if (namespace === "entityIds") continue; // Skip entityIds

        if (models && typeof models === "object") {
            for (const [model, modelData] of Object.entries(models)) {
                const namespaceModel = `${namespace}-${model}`;

                if (
                    modelData &&
                    typeof modelData === "object" &&
                    "$" in modelData
                ) {
                    const conditions = modelData.$;
                    if (
                        conditions &&
                        typeof conditions === "object" &&
                        "where" in conditions
                    ) {
                        const whereClause = conditions.where;
                        if (whereClause && typeof whereClause === "object") {
                            // Separate $is conditions from other conditions
                            const hasIsClause = Object.values(whereClause).some(
                                (condition: any) => "$is" in condition
                            );

                            if (hasIsClause) {
                                // Extract $is conditions for Keys clause
                                const isConditions: any = {};
                                const otherConditions: any = {};
                                for (const [
                                    member,
                                    memberValue,
                                ] of Object.entries(whereClause)) {
                                    if (
                                        typeof memberValue === "object" &&
                                        memberValue !== null &&
                                        "$is" in memberValue
                                    ) {
                                        isConditions[member] = memberValue;
                                    } else {
                                        otherConditions[member] = memberValue;
                                    }
                                }

                                // Build Keys clause using existing function
                                const keyClauses = convertQueryToKeysClause(
                                    {
                                        [namespace]: {
                                            [model]: {
                                                $: {
                                                    where: isConditions,
                                                },
                                            },
                                        },
                                    } as Omit<
                                        SubscriptionQueryType<T>,
                                        "entityIds"
                                    >,
                                    schema
                                );
                                clauses.push(...(keyClauses as any));

                                // Process other conditions as Member clauses
                                for (const [
                                    member,
                                    memberValue,
                                ] of Object.entries(otherConditions)) {
                                    if (
                                        typeof memberValue === "object" &&
                                        memberValue !== null
                                    ) {
                                        for (const [op, val] of Object.entries(
                                            memberValue
                                        )) {
                                            clauses.push({
                                                Member: {
                                                    model: namespaceModel,
                                                    member,
                                                    operator:
                                                        convertOperator(op),
                                                    value: convertToPrimitive(
                                                        val
                                                    ),
                                                },
                                            });
                                        }
                                    } else {
                                        // Assume equality condition
                                        clauses.push({
                                            Member: {
                                                model: namespaceModel,
                                                member,
                                                operator: "Eq",
                                                value: convertToPrimitive(
                                                    memberValue
                                                ),
                                            },
                                        });
                                    }
                                }
                            } else {
                                // No $is conditions, process all as Member clauses
                                for (const [
                                    member,
                                    memberValue,
                                ] of Object.entries(whereClause)) {
                                    if (
                                        typeof memberValue === "object" &&
                                        memberValue !== null
                                    ) {
                                        for (const [op, val] of Object.entries(
                                            memberValue
                                        )) {
                                            clauses.push({
                                                Member: {
                                                    model: namespaceModel,
                                                    member,
                                                    operator:
                                                        convertOperator(op),
                                                    value: convertToPrimitive(
                                                        val
                                                    ),
                                                },
                                            });
                                        }
                                    } else {
                                        // Assume equality condition
                                        clauses.push({
                                            Member: {
                                                model: namespaceModel,
                                                member,
                                                operator: "Eq",
                                                value: convertToPrimitive(
                                                    memberValue
                                                ),
                                            },
                                        });
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // Handle the case where there are no conditions
                    clauses.push({
                        Keys: {
                            keys: [undefined],
                            pattern_matching: "FixedLen",
                            models: [namespaceModel],
                        },
                    });
                }
            }
        }
    }

    // If there are clauses, combine them under a single Composite clause
    if (clauses.length > 0) {
        return {
            Composite: {
                operator: "And",
                clauses: clauses,
            },
        };
    }

    // If there are no clauses, return an empty Composite
    return {
        Composite: {
            operator: "And",
            clauses: [],
        },
    };
}

/**
 * Converts a value to a Torii primitive type.
 *
 * @param {any} value - The value to convert.
 * @returns {torii.MemberValue} - The converted primitive value.
 * @throws {Error} - If the value type is unsupported.
 *
 * @example
 * const primitiveValue = convertToPrimitive(42);
 * console.log(primitiveValue); // { Primitive: { U32: 42 } }
 */
function convertToPrimitive(value: any): torii.MemberValue {
    if (typeof value === "number") {
        return { Primitive: { U32: value } };
    } else if (typeof value === "boolean") {
        return { Primitive: { Bool: value } };
    } else if (typeof value === "bigint") {
        return {
            Primitive: {
                Felt252: torii.cairoShortStringToFelt(value.toString()),
            },
        };
    } else if (typeof value === "string") {
        return { String: value };
    }

    // Add more type conversions as needed
    throw new Error(`Unsupported primitive type: ${typeof value}`);
}

/**
 * Converts a query operator to a Torii comparison operator.
 *
 * @param {string} operator - The query operator to convert.
 * @returns {torii.ComparisonOperator} - The corresponding Torii comparison operator.
 * @throws {Error} - If the operator is unsupported.
 *
 * @example
 * const comparisonOperator = convertOperator("$eq");
 * console.log(comparisonOperator); // "Eq"
 */
function convertOperator(operator: string): torii.ComparisonOperator {
    switch (operator) {
        case "$eq":
            return "Eq";
        case "$neq":
            return "Neq";
        case "$gt":
            return "Gt";
        case "$gte":
            return "Gte";
        case "$lt":
            return "Lt";
        case "$lte":
            return "Lte";
        default:
            throw new Error(`Unsupported operator: ${operator}`);
    }
}
