import { Field } from "./field.js";
import { valOrDefault } from "@zenkai/utils/datatype/index.js";

export const StringField = Field.create({
    init() {
        var self = this;

        var validator = function () {
            return true;
        };

        this.validators.push(validator);
    },
    object: "STRING",
    struct: undefined
});