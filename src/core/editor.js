/// <reference path="../pubsub.js" />
/// <reference path="../enums.js" />
/// <reference path="../helpers/helpers.js" />
/// <reference path="../utils/utils.js" />
/// <reference path="../utils/interactive.js" />
/// <reference path="../autocomplete.js" />
/// <reference path="../model/model.js" />
/// <reference path="../model/modelElement.js" />
/// <reference path="../projection.js" />

import { HELPER } from './../helpers/index.js';
import { UTILS } from './../utils/index.js';
import { Autocomplete } from './../autocomplete.js';
import { Exception } from './../exception.js';
import { MetaModel } from './../model/index.js';
import { Projection } from './../projection.js';
import { __ENV, __VERSION } from './../global.js';
import { Key, EventType, UI } from './../enums.js';
import { events } from './../pubsub.js';
import { DOC } from './../global.js';

/** 
 * @namespace
 */
export const Editor = (function ($, _, Autocomplete, _MODEL, PROJ, ERR) {
    "use strict";

    console.log($);

    const container = $.getElement("[data-gentleman-editor]");
    container.tabIndex = -1;

    const EL = UI.Element;
    const EditorMode = {
        READ: 'read',
        EDIT: 'edit'
    };

    // Indicates whether the display is mobile mode
    var MOBILE = $.windowWidth <= 700;

    /**
     * Gets the name of the object if available
     * @param {Object} obj 
     * @returns {string|null} name
     */
    function nameof(obj) { return _.valOrDefault(obj.name, null); }

    /**
     * Preprend a string with a dot
     * @param {string} str 
     * @returns {string}
     */
    function dot(str) { return '.' + str; }

    /**
     * Preprend a string with a hashtag
     * @param {string} str 
     * @returns {string}
     */
    function hash(str) { return '#' + str; }

    function f_class(el) { return dot(el.class); }

    // Allow responsive design
    var mql = window.matchMedia('(max-width: 800px)');

    /**
     * State management
     * @lends state#
     */
    const state = {
        /**
         * Creates a `state` instance
         * @returns {state} state instance
         */
        create: function () {
            var instance = Object.create(this);

            var past = [];
            var future = [];

            /**
             * @memberof state#
             */
            var undo = function () {
                future = [instance.current, ...future];
                instance.current = past.pop();
            };

            var redo = function () {
                past = [...past, instance.current];
                instance.current = future[0];
                future = future.slice(1);
            };

            var set = function (val) {
                past = [...past, instance.current];
                instance.current = _.cloneObject(val);
                future = [];
            };

            var clear = function () {
                past = [];
                future = [];
            };

            _.defProp(instance, 'hasUndo', {
                get() { return past.length > 0; },
            });
            _.defProp(instance, 'hasRedo', {
                get() { return future.length > 0; },
            });

            Object.assign(instance, { undo, redo, set, clear });

            return instance;
        },
        init(val) {
            this.clear();
            this.current = _.cloneObject(val);
        },
        current: undefined
    };

    /**
     * @lends Editor
     */
    var pub = {
        /** @type {state} */
        state: state.create(),
        menu: null,
        note: null,
        MM: null,
        create(metamodel) {
            const KEY_CONFIG = '@config';
            const KEY_RESOURCE = '@resources';

            var instance = Object.create(this);
            instance.MM = metamodel;

            // display language
            if (metamodel[KEY_CONFIG]) {
                let config = metamodel[KEY_CONFIG];
                if (config.language) {
                    instance._language = config.language;
                }
            }

            // add stylesheets
            if (metamodel[KEY_RESOURCE]) {
                let dir = '../assets/css/';
                // remove stylesheets applied by previous meta-models
                var links = $.getElements(dot('gentleman-css'));
                for (let i = 0, len = links.length; i < len; i++) {
                    links.item(i).remove();
                }
                metamodel[KEY_RESOURCE].forEach(function (name) {
                    DOC.head.appendChild($.createLink('stylesheet', dir + name, { class: 'gentleman-css' }));
                });
            }

            instance._abstract = null;
            instance._concrete = null;
            instance._current = null;
            instance._isInitialized = false;

            instance._body = $.createDiv({ class: 'body' });
            instance._autocomplete = Autocomplete.create();
            instance._mode = false;

            return {
                init(model) { instance.init(model); },
                get language() { return instance.language; },
                get model() { return instance.concrete; },
                get state() { return instance.state; },
                get mode() { return instance._mode; },
                set mode(val) {
                    instance._mode = val;
                    const READ_MODE = 'read-mode';
                    switch (val) {
                        case EditorMode.EDIT:
                            // remove read mode styles from the body
                            $.removeClass(instance.body, READ_MODE);

                            // restore attributes editable state
                            instance.projections.forEach(function (p) { p.enable(); });

                            break;
                        case EditorMode.READ:
                            // apply read mode styles to the body 
                            $.addClass(instance.body, READ_MODE);

                            // disable all attributes => readonly
                            instance.projections.forEach(function (p) { p.disable(); });

                            break;
                    }
                },
                undo() {
                    instance.state.undo();
                    instance.setState(_.cloneObject(instance.state.current));
                    events.emit('editor.undo', instance.state.hasUndo);
                },
                redo() {
                    instance.state.redo();
                    instance.setState(_.cloneObject(instance.state.current));
                    events.emit('editor.redo', instance.state.hasRedo);
                },
                save() { instance.save(); },
                copy() {
                    var el = $.createTextArea({ value: instance.abstract.toString(), readonly: true });
                    $.fakeHide(el);
                    container.appendChild(el);
                    el.select();
                    DOC.execCommand('copy');
                    el.remove();
                }
            };
        },
        /** @type {MetaModel} */
        get abstract() { return this._abstract; }, // abstract (static) model
        set abstract(val) { this._abstract = val; },
        get concrete() { return this._concrete; }, // concrete (dynamic) mode
        set concrete(val) { this._concrete = val; },
        get current() { return this._current; }, // current position in model
        set current(val) { this._current = val; },
        /** @type {string} */
        get language() { return this._language; },

        /** @type {Autocomplete} */
        get autocomplete() { return this._autocomplete; }, // autocomplete element
        /** @type {Projection[]} */
        get projections() { return this.abstract.projections; },
        get options() { return this.abstract.options; },

        /** @returns {HTMLElement} */
        get currentLine() { return this._currentLine; }, // current line in representation
        set currentLine(val) { this._currentLine = val; },
        /** @returns {HTMLElement} */
        get body() { return this._body; },

        /** @type {boolean} */
        get isInitialized() { return this._isInitialized; },
        /** @type {boolean} */
        get hasError() { return this._hasError; },

        getProjection(index) { return this.projections[index]; },

        resize() {
            var self = this;

            // TODO: adapt UI to smaller screen
        },
        setState(s) {
            var self = this;
            // set concrete to new state
            self._concrete = s;
            // reinitialize abstract
            self._abstract.init(self._concrete);
            // set current to newly create element
            self._current = self._abstract.createModelElement(self._concrete.root, true);

            // clear and render
            self.clear();
            self.currentLine = self.body;
            self.render();
        },
        save() {
            var self = this;
            self.state.set(self.concrete);
            events.emit('editor.save');
        },
        clear() {
            var self = this;
            $.removeChildren(self.body);
            events.emit('editor.clear');
        },
        init(model) {
            const KEY_ROOT = '@root';

            if (model) {
                this.concrete = model;
            } else {
                let root = this.MM[KEY_ROOT];
                if (root) {
                    this.concrete = { root: JSON.parse(JSON.stringify(this.MM[root])) };
                } else { // throw an error if the root was not found.
                    let error = ERR.InvalidModelError.create("Root not found: The model does not contain an element with the attribute root");
                    container.appendChild($.createP({ class: 'body', text: error.toString() }));
                    throw error;
                }
            }

            // initialize the model
            this.abstract = _MODEL.create(this.MM, this._concrete);
            this.current = this.abstract.createModelElement(this.concrete.root, true);

            // set the initial state
            this.state.init(this.concrete);
            events.emit('editor.state.initialized');

            // clear the body
            this.clear();
            this.currentLine = this.body;
            $.hide($.getElement(hash('splashscreen')));

            // draw the editor
            this.render();

            // Get next element
            var next = $.getElement(f_class(EL.ATTRIBUTE), this.currentLine) || $.getElement(f_class(EL.OPTION), container);
            var parent = next.parentElement;
            if (parent !== this.currentLine) {
                this.currentLine = parent;
            }

            next.focus();

            if (!this.isInitialized) {
                events.emit('editor.initialized');
                // add the event handlers
                this.bindEvents();
                this._isInitialized = true;
            }
        },
        render() {
            if (!this.isInitialized) {
                $.preprendChild(container, this.body);
            }

            this.currentLine.appendChild(this.current.render());
            this.currentLine = this.currentLine.firstChild;
            this.currentLine.contentEditable = false;
        },
        openConv() {
            var self = this;

            const CONVO = 'convo';
            const CONVO_USER = [CONVO, 'convo--user'];
            const CONVO_GENTLEMAN = [CONVO, 'convo--gentleman', 'font-gentleman'];

            var container = $.getElement(dot('convo-container'));
            var greeting = $.createP({ class: CONVO_GENTLEMAN });
            var qq, convo;
            if (container) {
                $.show(container);
                convo = $.getElement(dot('convo-wrapper'));
                convo.appendChild(greeting);
                qq = $.getElement(dot('question'));
            } else {
                container = $.createDiv({ class: 'convo-container' });
                convo = $.createDiv({ class: ['convo-wrapper'] });
                convo.appendChild(greeting);
                qq = $.createTextArea({ class: ['question'], placeholder: "Ask a question" });
                qq.addEventListener(EventType.KEYDOWN, function (event) {
                    switch (event.key) {
                        case Key.enter:
                            var val = qq.value;
                            var q = $.createP({ class: CONVO_USER, text: val });
                            convo.appendChild(q);
                            qq.value = "";

                            // delay answer => conv feeling (UX)
                            setTimeout(function () {
                                var a = $.createP({ class: CONVO_GENTLEMAN });
                                convo.appendChild(a);
                                var ask_response = ask(val);
                                $.TypeWriter(a, ask_response, function () {
                                    if (ask_response.close) {
                                        setTimeout(function () { $.hide(container); }, 500);
                                    }
                                });
                            }, 200);

                            event.preventDefault();
                            event.stopPropagation();

                            break;
                        case Key.backspace:
                            event.stopPropagation();

                            break;
                        case Key.escape:
                            $.hide(container);
                            event.stopPropagation();

                            break;
                        default:
                            break;
                    }

                });
                $.appendChildren(container, [convo, qq]);
                self.body.appendChild(container);
            }
            $.TypeWriter(greeting, [{ type: 0, val: "Hello, how may I help you?" }]);
            qq.focus();

            /**
             * Process question
             * @param {string} qq question
             * @returns {string} answer
             */
            function ask(qq) {
                const THANK_YOU = ['thx', 'ty', 'thanks', 'thank'];
                const POLITE = ["You're welcome.", "I'm happy to help.", "Glad I could help.", "Anytime.", "It was nothing.", "No problem.", "Don't mention it.", "It was my pleasure."];
                const BYE = ['bye', 'close', 'exit', 'done'];

                // remove accents and keep words
                var words = _.removeAccents(qq).replace(/[^a-zA-Z0-9 _-]/gi, '').split(' ');
                if (words.findIndex(function (val) { return val.toLowerCase() === 'version'; }) !== -1) {
                    return [
                        { type: 0, val: "You are currently using Gentleman " },
                        { type: 1, val: "version " + __VERSION }
                    ];
                } else if (words.findIndex(function (val) { return THANK_YOU.indexOf(val.toLowerCase()) !== -1; }) !== -1) {
                    return [{ type: 0, val: POLITE[_.random(POLITE.length - 1)] }];
                } else if (words.findIndex(function (val) { return BYE.indexOf(val.toLowerCase()) !== -1; }) !== -1) {
                    let result = [{ type: 0, val: "Good bye, happy coding :)" }];
                    result.close = true;
                    return result;
                } else {
                    return [{ type: 0, val: "Sorry, I cannot answer this question at the moment. Ask me again later." }];
                }
            }
        },
        bindEvents: function () {
            var self = this;

            var currentContainer,
                lastKey;
            var flag = false;
            var handled = false;

            self.body.addEventListener(EventType.CLICK, function (event) {
                if (!handled) {
                    self.autocomplete.hide();
                } else {
                    handled = false;
                }
            }, false);

            container.addEventListener(EventType.KEYUP, function (event) {
                var target = event.target;
                var projection = self.getProjection(target.id);

                if (projection && target.textContent === "") {
                    projection.update();
                }

                if (lastKey == event.key) lastKey = -1;

                switch (event.key) {
                    case Key.spacebar:
                        if (lastKey == Key.ctrl) {
                            if (projection && !projection.isDisabled) showAutoComplete(projection);
                        }
                        break;
                    case Key.delete:
                        if (lastKey == Key.ctrl) {
                            flag = true;
                            projection.delete();
                            flag = false;
                        }
                        break;
                    case "z":
                        if (lastKey == Key.ctrl) {
                            flag = true;
                            self.state.undo();
                            flag = false;
                        }
                        break;
                    case 'g':
                        if (lastKey === Key.ctrl) {
                            self.openConv();
                            event.preventDefault();
                        }
                        break;
                    default:
                        break;
                }
            }, false);

            container.addEventListener(EventType.KEYDOWN, function (event) {
                var target = event.target;
                var parent = target.parentElement;
                var projection = self.getProjection(target.id);

                switch (event.key) {
                    case Key.backspace:
                        if (self.abstract.isEnum(projection.type)) {
                            projection.value = "";
                        }
                        break;
                    case Key.ctrl:
                        lastKey = Key.ctrl;
                        event.preventDefault();
                        break;
                    case Key.delete:
                        if (self.abstract.isEnum(projection.type)) {
                            projection.value = "";
                            // remove text content only
                            // target.firstChild.nodeValue = "";
                        }
                        break;
                    case Key.enter:
                        self.autocomplete.hasFocus = false;
                        target.blur(); // remove focus

                        event.preventDefault();

                        break;
                    case Key.escape:
                        self.autocomplete.hide();

                        break;
                    case Key.tab:
                        self.autocomplete.hasFocus = false;

                        break;
                    case "z":
                    case 'g':
                        if (lastKey == Key.ctrl) {
                            event.preventDefault();
                        }

                        break;
                    default:
                        break;
                }

                if (event.key.length === 1) {
                    $.removeClass(target, UI.EMPTY);
                    $.removeClass(parent, UI.EMPTY);
                }
            }, false);

            self.body.addEventListener(EventType.FOCUSIN, function (event) {
                self.autocomplete.hide();
                handled = true;

                var target = event.target;
                var projection = self.getProjection(target.id);

                currentContainer = findLine(target);
                if (currentContainer) {
                    $.addClass(currentContainer, 'current');
                }

                var data = [];

                if ($.hasClass(target, 'option')) {
                    let path = target.getAttribute('data-path');
                    let position = target.getAttribute('data-position');
                    position = position.split('..');
                    var min = position[0];
                    var max = position[1];

                    var index = target.dataset['index'];
                    var parentMElement = self.options[+index];

                    data = parentMElement.options.filter(function (x) {
                        return x.position >= min && x.position <= max;
                    });
                    data = data.map(function (el) { return { val: el.name, element: el }; });

                    self.autocomplete.init(target, data);
                    self.autocomplete.onSelect = function (val) {
                        optionHandler(val, target, data);
                    };
                } else if (projection) {
                    if (projection.isDisabled) return;
                    projection.focusIn();
                    events.emit('editor.change', projection);

                    if (isExtension(projection)) {
                        data = projection.valuesKV();
                        self.autocomplete.onSelect = function (attr) {
                            let line = projection.implement(attr.key);
                            $.getElement(f_class(EL.ATTRIBUTE), line).focus();
                        };

                        self.autocomplete.init(target, data);
                    } else if (isPointer(projection) || isEnum(projection)) {
                        data = projection.valuesKV();
                        self.autocomplete.onSelect = function (attr) {
                            projection.value = attr.key;
                            projection.focus();
                        };
                        self.autocomplete.init(target, data);
                    } else
                        return;
                }
            }, false);

            self.body.addEventListener(EventType.FOCUSOUT, function (event) {
                if (flag) {
                    flag = false;
                    return;
                }

                if (self.autocomplete.hasFocus && self.autocomplete.input == target) {
                    return;
                }

                var target = event.target;
                if (currentContainer) $.removeClass(currentContainer, 'current');

                if ($.hasClass(target, 'attr')) {
                    let projection = self.getProjection(target.id);
                    if (projection.isDisabled) return;

                    if (projection) {
                        projection.focusOut();
                        projection.update();
                    }

                    if (self.autocomplete.hasFocus) {
                        setTimeout(function () { validation_handler(target); }, 100);
                    } else {
                        validation_handler(target);
                    }
                }
            }, false);

            events.on('model.change', function (from) {
                console.log(from);
                self.save();
            });

            function validation_handler(target) {
                const ERROR = 'error';

                var parent = target.parentElement;
                var projection = self.getProjection(target.id);
                var lblError = $.getElement(hash(target.id + 'error'), parent);

                if (projection.validate()) {
                    if (lblError) {
                        lblError.parentElement.className = 'attr-validation-valid';
                        $.removeChildren(lblError);
                        $.hide(lblError);
                    }
                    $.removeClass(target, ERROR);
                } else {
                    if (!lblError) {
                        lblError = $.createSpan({ id: target.id + 'error', class: 'error-marker' });
                        let container = $.createSpan();
                        target.insertAdjacentElement('beforebegin', container);
                        container.appendChild(target);
                        container.appendChild(lblError);
                    }
                    lblError.innerHTML = projection.error;
                    lblError.parentElement.className = 'attr-validation-error';
                    $.addClass(target, ERROR);
                    $.show(lblError);
                }
            }

            function showAutoComplete(projection) {
                var data = [];

                // ignore if autocomplete is open
                if (self.autocomplete.isOpen) return;

                if (isExtension(projection)) {
                    data = projection.valuesKV();
                    self.autocomplete.onSelect = function (attr) {
                        let line = projection.implement(attr.key);
                        $.getElement(f_class(EL.ATTRIBUTE), line).focus();
                    };

                    self.autocomplete.init(projection._input, data);
                } else if (isPointer(projection) || isEnum(projection)) {
                    data = projection.valuesKV();
                    self.autocomplete.onSelect = function (attr) {
                        projection.value = attr.key;
                        projection.focus();
                    };
                    self.autocomplete.init(projection._input, data);
                }
            }

            function optionHandler(val, eHTML, data) {
                const COMPOSITION = 'composition';

                var path = eHTML.dataset['path'];
                var index = eHTML.dataset['index'];
                var parentMElement = self.options[+index];
                var compo = parentMElement.composition;
                var element = _.cloneObject(val.element);
                element.flag = true;

                compo.push(element);
                compo.sort(function (a, b) { return a.position - b.position; });
                events.emit('model.change', 'Editor[l.1008]:option');

                // render element
                var mElement = self.abstract.createModelElement(element);
                mElement.parent = parentMElement;
                parentMElement.elements.push(mElement);

                mElement.path = path + '[' + (compo.length - 1) + ']';
                var line = mElement.render(path + '[' + (compo.length - 1) + ']');
                Object.assign(line.dataset, { prop: COMPOSITION, position: element.position });

                $.insertBeforeElement(eHTML, line);

                // update options
                if (!element.multiple) {
                    eHTML.remove();
                    parentMElement.options = parentMElement.options.filter(function (x) {
                        return x.name !== element.name;
                    });
                    // add options
                    data = data.map(function (x) { return x.element; });
                    var left = data.filter(function (x) { return x.position < element.position; });
                    var right = data.filter(function (x) { return x.position > element.position; });

                    if (left.length > 0) {
                        left.sort(function (a, b) { return a.position - b.position; });
                        let input = $.createOptionSelect(left[0].position, left[left.length - 1].position, path);
                        input.dataset.index = index;
                        $.insertBeforeElement(line, input);
                    }
                    if (right.length > 0) {
                        right.sort(function (a, b) { return a.position - b.position; });
                        let input = $.createOptionSelect(right[0].position, right[right.length - 1].position, path);
                        input.dataset.index = index;
                        $.insertAfterElement(line, input);
                    }
                }

                var firstAttribute = $.getElement(f_class(EL.ATTRIBUTE), line);
                if (firstAttribute) firstAttribute.focus();
            }

            function getParent(eHTML, className) {
                var parent = eHTML.parentElement;
                return $.hasClass(parent, className) ? parent : parent.parentElement;
            }

            mql.addListener(handleWidthChange);

            function handleWidthChange(mql) {
                self.resize();
            }

            function findParent(keyword) {
                var parent = self.currentLine.parentElement;
                while (parent.parentElement.id != 'container') {
                    if ($.getElement(dot('keyword'), parent).innerHTML == keyword)
                        return parent;
                    parent = parent.parentElement;
                }
                return parent;
            }

            /**
             * Returns the
             * @param {HTMLElement} el 
             * @returns {null|HTMLElement}
             */
            function findLine(el) {
                var parent = el.parentElement;
                if ($.hasClass(parent, 'removable')) return parent;
                if (parent.isSameNode(container)) return null;
                return findLine(parent);
            }

            /**
             * Returns a value indicating whether the projection is an Enum
             * @param {Object} projection 
             */
            function isEnum(projection) { return PROJ.Enum.isPrototypeOf(projection); }

            /**
             * Returns a value indicating whether the projection is an Extension
             * @param {Object} projection 
             */
            function isExtension(projection) { return PROJ.Abstract.isPrototypeOf(projection); }

            /**
             * Returns a value indicating whether the projection is a Pointer
             * @param {Object} projection 
             */
            function isPointer(projection) { return PROJ.Pointer.isPrototypeOf(projection); }
        }
    };

    return pub;
})(UTILS, HELPER, Autocomplete, MetaModel, Projection, Exception);