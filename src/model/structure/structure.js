import { valOrDefault, defProp } from "zenkai";


export const BaseStructure = {
    create(concept, schema) {
        const instance = Object.create(this);

        instance.concept = concept;
        instance.schema = schema;

        return instance;
    },
    /** Reference to parent model */
    model: null,
    /** Cache of the schema describing the concept */
    schema: null,
    /** Link to the concept data source */
    source: null,
    /** @type {int} */
    id: null,
    /** @type {*[]} */
    value: null,
    /** @type {string} */
    object: "structure",

    init(value) { throw new Error("This function has not been implemented"); },
    render() { return this.projection.render(); }
};

defProp(BaseStructure, 'model', { get() { return this.concept.model; } });
defProp(BaseStructure, 'alias', { get() { return this.schema.alias; } });
defProp(BaseStructure, 'name', { get() { return this.schema.name; } });
defProp(BaseStructure, 'required', { get() { return valOrDefault(this.schema.required, true); } });