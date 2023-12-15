/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

// @INCLUDE_IN_API_DOCS

/**
 * Use this module to communicate easily with node and vice versa. A `NodeConnector` is an intermediary between a
 * module in node and a module in phcode. With a `NodeConnector` interface, you can execute a function in node
 * from phoenix by simply calling `await nodeConnectorObject.execPeer("namedFunctionInNodeModule, argObject")` and
 * the resolved promise will have the result. No need to do any complex IPC or anything else. See a step by step
 * example below on how this is done.
 *
 * ## The setup
 * Assume that you have a module in phcode `x.js` and another module in node `y.js`. To communicate between `x` and `y`
 * we have to first create a `NodeConnector` on both sides. A `NodeConnector` will have a unique ID that will be
 * same in both sides. In this example, lets set the id as `ext_x_y` where `ext` is your extension id to prevent
 * name collision with other extensions. Phoenix core reserves the prefix `ph_` for internal use.
 *
 * ### Create `NodeConnector` in Phoenix side `x.js`
 * ```js
 * const NodeConnector = require('NodeConnector');
 * const XY_NODE_CONNECTOR_ID = 'ext_x_y';
 * let nodeConnector;
 * const nodeConnectedPromise = NodeConnector.createNodeConnector(XY_NODE_CONNECTOR_ID, exports).then(connector=>{
 *  nodeConnector = connector;
 * });
 *
 * exports.modifyImage = async functions(imageName, imageArrayBugger){
 *   // do some image ops with the imageArrayBugger
 *   // to return an arry buffer, you should return an object that contains a key `buffer` with the `ArrayBuffer` contents.
 *   return {
 *     operationDone: "colored,cropped",
 *     buffer: imageArrayBugger
 *   };
 * };
 * ```
 *
 * ### Create `NodeConnector` in Node `y.js`
 * ```js
 * const XY_NODE_CONNECTOR_ID = 'ext_x_y';
 * let nodeConnector;
 * const nodeConnectedPromise = global.createNodeConnector(XY_NODE_CONNECTOR_ID, exports).then(connector=>{
 *  nodeConnector = connector;
 * });
 *
 * exports.getPWDRelative = async functions(subPath){
 *   return process.cwd + "/" + subPath;
 * };
 * ```
 *
 * After the above, a node connector is now setup and available to use for 2 way communication.
 *
 * ## Executing Functions in Node from Phcode.
 * Suppose that you need to execute a function `getPWDRelative` in node module `y` from Phoenix.
 * Note that functions that are called with `execPeer` must be async and only takes a single argument.
 * A second optional argument can be passed which should be an ArrayBuffer to transfer large binary data(See below.).
 *
 * ### Calling `y.getPWDRelative` node module function from phoenix module `x.js`
 * ```js
 * // in x.js
 * // treat it like just any other function call. The internal RPC bits are handled by the NodeConnector.
 * // This makes working with node APIs very eazy in phcode.
 * // ensure that `nodeConnector` is set before using it here as it is returned by a promise!
 * await nodeConnectedPromise;
 * const fullPath = await nodeConnector.execPeer('getPWDRelative', "sub/path.html");
 * ```
 *
 * ## Executing Functions in Phcode from Node and sending binary data.
 * `execPeer` API accepts a single optional binary data that can be passed to the other side. In this example, we
 * will transfer an ArrayBuffer from node to phcode function `modifyImage` in module `x.js`
 *
 * ### Calling `x.modifyImage` phoenix module function from node module `y.js`
 * ```js
 * // in y.js
 * // ensure that `nodeConnector` is set before using it here as it is returned by a promise!
 * await nodeConnectedPromise;
 * const {operationDone, buffer} = await nodeConnector.execPeer('modifyImage', "theHills.png", imageAsArrayBuffer);
 * ```
 *
 * ## Events - Listening to and raising events between node and phoenix `NodeConnector`.
 * The nodeConnector object is an `EventDispatcher` implementing all the apis supported by `utils.EventDispatcher` API.
 * You can use `nodeConnector.triggerPeer(eventName, data, optionalArrayBuffer)` API to trigger an event on the other side.
 *
 * ### using `nodeConnector.triggerPeer(eventName, data, optionalArrayBuffer)`
 * Lets listen to a named `phoenixProjectOpened` event in node that will be raised from phoenix.
 *
 * In `y.js` in node
 * ```js
 * // in y.js
 * // ensure that `nodeConnector` is set before using it here as it is returned by a promise!
 * nodeConnector.on('phoenixProjectOpened', (_event, projectPath)={
 *   console.log(projectPath);
 * });
 * ```
 *
 * Now in Phoenix module `x.js`, we can raise the event on node by using the `triggerPeer` API.
 *
 * ```js
 * // in x.js
 * nodeConnector.triggerPeer("phoenixProjectOpened", "/x/project/folder");
 * // this will now trigger the event in node.
 * ```
 *
 * To listen, unlisten and see more operations of event handling available in `nodeConnector`, see docs for
 * `utils/EventDispatcher` module.
 *
 * ### Sending binary data in events
 * You can optionally send binary data with `triggerPeer`. See Eg. Below.
 * ```js
 * nodeConnector.triggerPeer("imageEdited", "name.png", imageArrayBuffer);
 * ```
 *
 * @module NodeConnector
 */

define(function (require, exports, module) {
    /**
     * Creates a new node connector with the specified ID and module exports.
     *
     * Returns a promise that resolves to an NodeConnector Object (which is an EventDispatcher with
     * additional `execPeer` and `triggerPeer` methods. `peer` here means, if you are executing `execPeer`
     * in Phoenix, it will execute the named function in node side, and vice versa.
     * The promise will be resolved only after a call to `createNodeConnector` on the other side with the
     * same `nodeConnectorID` is made. This is so that once the  promise is resolved, you can right away start
     * two-way communication (exec function, send/receive events) with the other side.
     *
     * - execPeer: A function that executes a peer function with specified parameters.
     * - triggerPeer: A function that triggers an event to be sent to a peer.
     * - Also contains all the APIs supported by `utils/EventDispatcher` module.
     *
     * @param {string} nodeConnectorID - The unique identifier for the new node connector.
     * @param {Object} moduleExports - The exports of the module that contains the functions to be executed on the other side.
     *
     * @returns {Promise} - A promise that resolves to an NodeConnector Object.
     *
     * @throws {Error} - If a node connector with the same ID already exists.
     */
    function createNodeConnector(nodeConnectorID, moduleExports) {
        return window.PhNodeEngine.createNodeConnector(nodeConnectorID, moduleExports);
    }

    exports.createNodeConnector = createNodeConnector;
});
