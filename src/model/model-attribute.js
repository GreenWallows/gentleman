import { DataType, UI } from './../enums.js';
import { HELPER } from './../helpers/index.js';
import { UTILS } from './../utils/index.js';
import { Projection } from './../projection.js';
import { Exception } from './../exception.js';
import { events } from './../pubsub.js';

export const ModelAttribute = (function ($, _, PN, ERR) {
    "use strict";

    const ButtonType = {
        Add: 'Add',
        New: 'New'
    };
    const ABSTRACT = 'abstract';

    // ClassName
    const ATTR_WRAPPER = 'attr-wrapper';

    const VAL = 'val';
    const EL = UI.Element;

    var ModelAttribute = {
        /**
         * Constructor
         * @param {Object} values
         * @returns {ModelAttribute}
         */
        create(values) {
            var instance = Object.create(this);

            Object.assign(instance, values, createProjection);
            instance._fnUpdate;
            instance._projections = [];
            instance._elements = [];
            if (Object.getPrototypeOf(instance) !== ModelAttribute && ModelAttribute.isPrototypeOf(instance)) {
                instance.init();
            }

            return instance;
        },

        /** @type {ModelElement} */
        get Element() { return this._parent; },
        /** @returns {MetaModel} */
        get MODEL() { return this.Element.model; },
        /** @type {string} */
        get name() { return this._name; },
        /** @type {string} */
        get type() { return this._type; },
        /** @type {boolean} */
        get isMultiple() { return this._isMultiple; },
        /** @type {boolean} */
        get isOptional() { return this._isOptional; },
        /** @type {string} */
        get path() { return this._path; },
        /** @type {string} */
        get representation() { return this._representation; },
        /** @type {Projection[]} */
        get projections() { return this._projections; },
        /** @type {ModelElement[]} */
        get elements() { return this._elements; },

        get fnUpdate() { return this._fnUpdate; },
        get fnCreateProjection() { return this._fnCreateProjection; },

        /**
         * Renders the HTML representation of the attribute
         * @abstract
         */
        render_attr() {
            if (Object.getPrototypeOf(this) !== ModelAttribute && ModelAttribute.isPrototypeOf(this))
                throw String(ERR.UnimplementedError.create('Unimplemented abstract method'));
        },
        handler(attr, val, path) {
            var self = this;
            var isMultiple = attr.hasOwnProperty('multiple');
            var type = attr.type;
            var valIndex, newpath;

            if (isMultiple) valIndex = attr.val.indexOf(val);

            var projection;
            // primitive type and enum handler
            if (self.MODEL.isDataType(type) || self.MODEL.isEnum(type)) {
                self.MODEL.path.push(isMultiple ? _.addPath(path, 'val[' + valIndex + ']') : path);
                projection = self.createProjection(val);

                if (attr.type === DataType.ID) {
                    self.MODEL.ID.push({
                        projection: projection,
                        type: self.MODEL.getModelElementType(self.Element._source)
                    });
                }

                return projection.createInput();
            } else if (self.MODEL.isElement(type)) {
                newpath = _.addPath(path, isMultiple ? 'val[' + valIndex + ']' : 'val');
                let mElement = self.MODEL.createModelElement(val);
                mElement.parent = self;
                self.elements.push(mElement);

                if (isMultiple) {
                    let item;
                    let isLast = valIndex == attr.val.length - 1;

                    let isInline = _.toBoolean(attr.inline);
                    if (!self.MODEL.hasComposition(type)) {
                        item = $.createLi({ class: 'array-item', prop: "val" });
                        // create an attribute wrapper and put the attributes in it
                        item.dataset.separator = _.valOrDefault(attr.separator, ',');
                        var wrapper = $.createDiv({ class: ['attr-wrapper', 'multiple'] });
                        wrapper.appendChild(mElement.render(newpath, true));
                        item.appendChild(wrapper);
                        mElement.eHTML = item;
                        mElement.index = valIndex;

                        if (!isInline) {
                            $.addClass(item, "block");
                            if (isLast) return renderButton(item, ButtonType.New, mElement);
                        } else {
                            if (isLast) return renderButton(item, ButtonType.Add, mElement);
                        }
                    } else {
                        item = mElement.render(newpath);

                        if (isLast) return renderButton(item, ButtonType.New);
                    }

                    return item;
                }

                return mElement.render(newpath);
            }

            return null;

            function renderButton(item, btnType, mElement) {
                var fragment = $.createDocFragment();
                fragment.appendChild(item);

                switch (btnType) {
                    case ButtonType.New:
                        fragment.appendChild($.createButtonNew(attr.name, function () {
                            buttonClickHandler(this, mElement);
                        }));
                        break;
                    case ButtonType.Add:
                        fragment.appendChild($.createButtonAdd(function () {
                            buttonClickHandler(this, mElement);
                        }));
                        break;
                    default:
                        break;
                }

                return fragment;
            }

            function buttonClickHandler(btn, mElem) {
                if (self.isMultiple)
                    self.add(self.MODEL.createInstance(self.type));
                else
                    self.value = self.MODEL.createInstance(self.type);

                var children = self.handler(self._source, self.value[self.count - 1], self.path);
                var newElem = self.getElement(-1);
                var container = children.children[0];
                var btnDelete = $.createButtonDelete(container, function () {
                    self.remove(self.elements.indexOf(newElem));
                    events.emit('model.change', 'ModelAttribute[l.162]:delete');
                });
                container.appendChild(btnDelete);
                btn.parentElement.appendChild(children);
                btn.remove();
            }
        },
        validate(projection) {
            var self = this;
            // constraint validation
            if (self._source.min) {
                if (+projection.value < self._source.min) {
                    projection.error = "Please enter a value greater than or equal to " + self._source.min;
                    return false;
                }
            }
            if (self._source.max) {
                if (+projection.value > self._source.max) {
                    projection.error = "Please enter a value less than or equal to " + self._source.max;
                    return false;
                }
            }

            return true;
        },
        remove() {
            var self = this;
            self.projections.splice(0).forEach(function (projection) {
                projection.remove();
            });
            self.elements.splice(0).forEach(function (el) {
                el.remove();
            });

            // restore the source value to its initial state
            if (self._val !== undefined) {
                self.value = self._val;
            } else {
                delete self._source.val;
            }
        },
        toString() {
            var self = this;

            if (this.elements.length) {
                let output = "";
                this.elements.forEach(function (el) {
                    output += _.toBoolean(self._source.inline) ? el.toString() : '\n' + el.toString();
                });
                return output;
            }

            if (this.projections.length) {
                let arr = this.projections.filter(function (p) { return !_.isNullOrWhiteSpace(p._input.textContent); });
                let output = arr.map(function (p) {
                    var val = p._input.textContent;
                    return self.type === DataType.string ? '"' + val + '"' : val;
                }).join(_.valOrDefault(self.separator, ''));
                if (arr.length) {
                    if (self.representation)
                        output = self.representation.val.replace('$val', output);
                }
                return output;
            }

            return "";
        }
    };

    const ModelAttributeSinglevalue = ModelAttribute.create({
        init() {
            var self = this;
            if (!self._source.hasOwnProperty(VAL))
                self._source.val = self.MODEL.createInstance(self._type);

            self._fnUpdate = function (val) {
                self.value = val;
            };
        },
        render_attr() {
            var self = this;

            var container;

            if (self.representation) {
                container = $.createDiv({ class: [ATTR_WRAPPER, UI.EMPTY] });
                let surround = self.representation.val.split('$val');
                Object.assign(container.dataset, { before: surround[0], after: surround[1] });
            } else {
                container = $.createDocFragment();
            }

            container.appendChild(self.handler(self._source, self.value, self.path));

            return container;
        },
        createProjection: createProjection
    });

    const ModelAttributeMultivalue = ModelAttribute.create({
        init() {
            var self = this;
            if (!self._source.hasOwnProperty(VAL)) {
                let min = _.valOrDefault(self._source.multiple.min, 1);
                if (min == 0 || self.isOptional) {
                    self._source.val = [];
                } else if (min > 0) {
                    self._source.val = [];
                    for (let i = 0; i < min; i++)
                        self._source.val.push(self.MODEL.createInstance(self._type));
                } else {
                    ERR.InvalidModelError.create("Unexpected value for the min property");
                }
            }

            self._isMultiple = true;
            self._represent = "";
            self.indexer = {};

            self._fnUpdate = function (val, index) { self.set(val, index); };
        },
        createProjection: function (val) {
            var self = this;
            var projection = createProjection.call(self, val);
            projection.index = self.count - 1;
            return projection;
        },

        get fnMultiple() { return this._fnMultiple; },
        set fnMultiple(fn) { this._fnMultiple = fn; },

        get represent() { return this._represent; },
        set represent(val) { this._represent = val; },

        multiple_handler() { this.fnMultiple(); },

        render_attr() {
            var self = this;
            var M = self.MODEL;
            var container = $.createDocFragment();

            if (self.fnMultiple) {
                return self.fnMultiple();
            } else {
                if (!M.isElement(self.type) || !M.hasComposition(self.type)) {
                    if (self.isOptional) {
                        // create add button to add more item
                        let btnCreate = $.createButtonNew(self.name, function () {
                            self.eHTML = self.createContainer();
                            $.insertBeforeElement(btnCreate, self.eHTML);
                            self.initValueHandler();
                            this.remove();
                        });
                        $.addClass(btnCreate, 'inline');
                        container.appendChild(btnCreate);
                    } else {
                        self.eHTML = self.createContainer();
                        container.appendChild(self.eHTML);
                        self.initValueHandler();
                    }
                } else {
                    self.eHTML = container;
                    self.initValueHandler();
                }

                return container;
            }
        },
        initValueHandler() {
            var self = this;

            var M = self.MODEL;
            var len = self.value.length;

            if (len === 0) {
                // create add button to add more item
                let btnCreate = $.createButtonNew(self.name, btnCreate_Click);
                self.eHTML.appendChild(btnCreate);
            } else {
                for (let i = 0, last = len - 1; i < len; i++) {
                    self.eHTML.appendChild(self.handler(self._source, self.value[i], self.path, i === last));
                }
                if (M.isDataType(self.type) || M.isEnum(self.type)) {
                    let btnadd = $.createButtonAdd(function () {
                        var instance = M.createInstance(self.type);
                        self.add(instance);

                        // render
                        let li = (self.handler(self._source, instance, self.path));
                        $.insertBeforeElement(this, li);
                        let btnDelete = $.createButtonDelete(li, function () {
                            self.remove(self.count - 1);
                            events.emit('model.change', 'attribute:delete_clicked');
                        });
                        li.appendChild(btnDelete);

                        // focus on first element newly created
                        $.getElement(EL.ATTRIBUTE.toClass(), li).focus();
                    });
                    self.eHTML.appendChild(btnadd);
                }
            }

            function btnCreate_Click() {
                self.add(M.createInstance(self.type));

                var lastIndex = self.count - 1;
                var children = self.handler(self._source, self.value[lastIndex], self.path);
                var parent = this.parentElement;
                parent.appendChild(children);
                $.removeClass(parent, UI.EMPTY);
                this.remove();
            }
        },
        createContainer() {
            var self = this;
            var M = self.MODEL;

            var ul = $.createUl({
                class: "bare-list " + (M.isElement(self.type) && M.getModelElement(self.type).extensions ?
                    "list empty" : "array")
            });

            if (self._source.inline === false) $.addClass(ul, "block");
            Object.assign(ul.dataset, { multiple: true });
            if (self.representation) {
                var surround = self.representation.val.split("$val");
                Object.assign(ul.dataset, { before: surround[0], after: surround[1] });
            }

            return ul;
        },
        get(index) { return this._source.val[index]; },
        getIndex(val) { return this._source.val.indexOf(val); },
        getElement(index) {
            var self = this;
            return index < 0 ? self.elements[self.elements.length + index] : self.elements[index];
        },
        set(val, index, el) {
            var self = this;

            if (self._source.val[index] !== val) {
                self._source.val[index] = val;
                events.emit('model.change', 'ModelAttributeMultivalue[l.405]:set');
            }

            if (el) {
                self.elements[index] = el;
            }
        },
        add(val) {
            var self = this;

            self._source.val.push(val);
            events.emit('model.change', 'ModelAttributeMultivalue[l.416]:add');
        },
        remove(index) {
            var self = this;

            if (index > -1) {
                if (self.projections[index]) self.projections.splice(index, 1)[0].remove();
                if (self.elements[index]) self.elements.splice(index, 1)[0].remove();
                self._source.val.splice(index, 1);
            } else {
                self.removeAll();
            }

            var isLast = self._source.val ? self.count === 0 : false;
            if (self.name === 'category' && self.multiplicity.min > 0 && isLast) {
                var instance = self.MODEL.createInstance(self.type);
                var mElem = self.MODEL.createModelElement(instance);
                self.eHTML.appendChild(self.handler(self._source, instance, self.path, true));
                self.set(instance, index, mElem);
            }
        },
        removeAll() {
            var self = this;

            self.projections.slice(0).forEach(function (projection) { projection.remove(); });
            self.elements.slice(0).forEach(function (el) { el.remove(); });

            // restore the source value to its initial state
            if (self._val !== undefined) {
                self.value = self._val;
            } else {
                delete self._source.val;
            }
            self.indexer = {};
        }
    });

    _.defProp(ModelAttributeMultivalue, 'count', {
        get() { return this._source.val.length; }
    });
    _.defProp(ModelAttributeMultivalue, 'multiplicity', {
        get() { return this._source.multiple; }
    });
    _.defProp(ModelAttributeMultivalue, 'separator', {
        get() { return _.valOrDefault(this._source.separator, ','); }
    });
    _.defProp(ModelAttribute, 'value', {
        get() { return this._source.val; },
        set(val) {
            if (this._source.val !== val) {
                this._source.val = val;
                events.emit('model.change', 'ModelAttribute[l.467]:set');
            }
        }
    });

    function prepare(el, attr, path) {
        return Object.freeze({
            _parent: el,
            _source: attr,
            _val: attr.val,
            _name: attr.name,
            _path: _.addPath(path, 'attr.' + attr.name),
            _type: attr.type,
            _isOptional: _.toBoolean(attr.optional),
            _representation: attr.representation
        });
    }

    function createProjection(val) {
        var self = this;
        var M = self.MODEL;

        var element = self.MODEL.getModelElement(self.type);
        var packet = PN.Base.prepare(self.MODEL.generateID(), val, self, self.type, self.fnUpdate);
        var projection;

        // abstract element
        if (val && val.hasOwnProperty(ABSTRACT)) {
            projection = PN.Abstract.create(packet);
            projection.extensions = element.extensions;
        }
        else if (element) {
            let elementType = M.getModelElementType(element);
            if (M.isEnum(elementType)) {
                projection = PN.Enum.create(packet);
                projection.values = element.values;
            } else if (M.isDataType(elementType)) {
                projection = PN.DataType.create(packet);
                projection.struct = element;
            } else {
                projection = PN.Base.create(packet);
            }
        } else if (self.type === DataType.IDREF) {
            projection = PN.Pointer.create(packet);
            projection.reference = self._source.ref;
        } else {
            projection = PN.Base.create(packet);
        }

        // if (self.fnCreateProjection) self.fnCreateProjection(projection);

        self.projections.push(projection);
        self.MODEL.projections.push(projection);

        return projection;
    }

    return {
        prepare: prepare,
        SingleValueAttribute: ModelAttributeSinglevalue,
        MultiValueAttribute: ModelAttributeMultivalue
    };
})(UTILS, HELPER, Projection, Exception);