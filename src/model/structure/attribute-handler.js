import { isNullOrUndefined, isEmpty, valOrDefault, isNullOrWhitespace, cloneObject } from "zenkai";
import { Attribute } from "./attribute";


export const AttributeHandler = {
    /** @type {Attribute[]} */
    attributes: null,

    /** @returns {Attribute[]} */
    initAttribute() {
        this.attributes = [];
        this.attributes._created = new Set();
        this.attributes._updated = new Set();
        this.attributes._deleted = new Set();

        return this;
    },
    getAttributes() {
        return this.attributes;
    },
    /**
     * Returns an attribute matching the query
     * @param {*} query
     * @returns {Attribute}
     */
    getAttribute(query) {
        if (isNullOrUndefined(query)) {
            throw new TypeError("Bad argument");
        }

        if (query.type === "id") {
            return this.getAttributeById(query.value);
        }

        return this.getAttributeByName(query);
    },
    /**
     * Returns an attribute with the given name
     * @param {string} name 
     * @returns {Attribute}
     */
    getAttributeSchema(name) {
        if (isNullOrWhitespace(name)) {
            throw new TypeError("Bad argument");
        }

        if (!this.hasAttribute(name)) {
            throw new Error(`Attribute '${name}' does not exist`);
        }

        return cloneObject(this.attributeSchema.find(attr => attr.name === name));
    },
    /**
     * Returns an attribute with the given name
     * @param {string} name 
     * @returns {Attribute}
     */
    getAttributeByName(name) {
        if (isNullOrWhitespace(name)) {
            throw new TypeError("Bad argument");
        }

        var attribute = this.attributes.find((c) => c.name === name);

        if (isNullOrUndefined(attribute)) {
            attribute = this.createAttribute(name);
        }

        return attribute;
    },
    /**
     * Returns an attribute with the given id
     * @param {string} id 
     * @returns {Attribute}
     */
    getAttributeById(id) {
        if (isNullOrWhitespace(id)) {
            throw new TypeError("Bad argument");
        }

        var attribute = this.attributes.find((c) => c.id === id);

        return attribute;
    },
    /**
     * Creates an attribute
     * @param {string} name 
     * @returns {Attribute}
     */
    createAttribute(name, _value) {
        if (!this.hasAttribute(name)) {
            throw new Error(`Attribute not found: The concept '${this.name}' does not contain an attribute named ${name}`);
        }

        const schema = this.attributeSchema.find(attr => attr.name === name);

        let value = this.model.getValue(_value);
        
        var attribute = Attribute.create(this, schema).init(value);

        this.addAttribute(attribute);

        return attribute;
    },

    /**
     * Adds an attribute to the list of attributes held by the parent concept
     * @param {Attribute} attribute 
     */
    addAttribute(attribute) {
        if (isNullOrUndefined(attribute) || attribute.object !== "attribute") {
            throw new Error(`Bad argument: 'attribute' must be an attribute object`);
        }

        this.attributes.push(attribute);
        this.attributes._created.add(attribute.name);

        this.notify("attribute.added", attribute);

        return this;
    },
    /**
     * Returns a value indicating whether the concept has any attributes
     * @returns {boolean}
     */
    hasAttributes() {
        return !isEmpty(this.attributeSchema) || !isEmpty(this.attributes);
    },
    /**
     * Returns a value indicating whether the concept has an attribute
     * @param {string} name Attribute's name
     * @returns {boolean}
     */
    hasAttribute(name) {
        return this.attributeSchema.findIndex(attr => attr.name === name) !== -1;
    },
    /**
     * Returns a value indicating whether the attribute is required
     * @param {string} name Attribute's name
     * @returns {boolean}
     */
    isAttributeRequired(name) {
        const attribute = this.attributeSchema.find(attr => attr.name === name);

        return valOrDefault(attribute.required, true);
    },
    /**
     * Returns a value indicating whether the attribute has been created
     * @param {string} name Attribute's name
     * @returns {boolean}
     */
    isAttributeCreated(name) {
        return this.attributes._created.has(name);
    },
    listAttributes() {
        const attributes = [];

        this.attributeSchema.forEach(attribute => {
            attributes.push({
                type: "attribute",
                name: attribute["name"],
                alias: attribute["alias"],
                description: attribute["description"],
                target: attribute["target"],
                accept: attribute["accept"],
                required: this.isAttributeRequired(name),
                created: this.isAttributeCreated(name)
            });
        });

        return attributes;
    },
    /**
     * Removes an attribute from a concept if possible
     * @param {string} name 
     */
    removeAttribute(name) {
        if (this.isAttributeRequired(name)) {
            return {
                message: `The attribute '${name}' is required.`,
                success: false,
            };
        }

        var index = this.attributes.findIndex(attr => attr.name === name);

        if (index === -1) {
            return {
                message: `The attribute '${name}' was not found.`,
                success: false,
            };
        }

        var removedAttribute = this.attributes.splice(index, 1)[0];
        this.attributes._created.delete(name);

        this.notify("attribute.removed", removedAttribute);

        return {
            message: `The attribute '${name}' was successfully removed.`,
            success: true,
        };
    },
};