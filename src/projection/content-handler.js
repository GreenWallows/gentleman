import { createSpan, createTextNode, isString, hasOwn, valOrDefault, createButton, createDocFragment } from "zenkai";
import { StyleHandler } from './style-handler.js';
import { AttributeHandler } from './structure-handler.js';
import { LayoutFactory } from "./layout/index.js";
import { FieldFactory } from "./field/index.js";
import { StaticFactory } from "./static/index.js";


export function ContentHandler(schema, concept, args) {
    const contentConcept = valOrDefault(concept, this.projection.concept);

    if (schema.type === "layout") {
        let layout = LayoutFactory.createLayout(this.model, schema.layout, this.projection).init(args);
        layout.parent = this;

        this.projection.environment.registerLayout(layout);

        return layout.render();
    } else if (schema.type === "field") {
        let field = FieldFactory.createField(this.model, schema, this.projection).init(args);
        field.model = this.model;
        field.parent = this;

        return field.render();
    } else if (schema.type === "static") {
        let staticContent = StaticFactory.createStatic(this.model, schema.static, this.projection).init(args);
        staticContent.parent = this;

        this.projection.environment.registerStatic(staticContent);

        return staticContent.render();
    } else if (schema.type === "attribute") {
        return AttributeHandler.call(this, schema, contentConcept);
    } else if (schema.type === "template") {
        let template = this.model.getModelTemplate(schema.name);

        const fragment = createDocFragment();
        template.content.forEach(element => {
            fragment.append(ContentHandler.call(this, element, concept, args));
        });

        return fragment;
    } else if (schema.type === "projection") {
        const { tag, style } = schema;

        /** @type {number} */
        const index = this.projection.schema.findIndex((x) => x.tags.includes(tag));

        /** @type {HTMLElement} */
        const element = createButton({
            class: ["btn"],
        }, ContentHandler.call(this, schema.content, concept, args));

        element.addEventListener('click', () => {
            this.projection.changeView(index);
        });

        StyleHandler(element, style);

        return element;
    }

    console.error(schema);

    throw new TypeError("Bad argument: The type is not recognized");
}