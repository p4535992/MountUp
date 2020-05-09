import { Chatter } from "./chatter.js";
import { findTokenById, warn, flagScope, flag } from "./utils.js";

/**
 * Provides all of the functionality for interacting with the game (tokens, canvas, etc.)
 */
export class MountManager {

    /**
     * Called when the mount up button was clicked on a token's HUD
     * Determines if conditions are appropriate for mounting, and executes the mount if so
     * @param {Object} data - The token from which the button was clicked on the hud
     */
    static async mountUp(data) {

        if (this.isaMount(data._id)) {
            this.restoreRiderSize(data._id);
            let mount = findTokenById(data._id);
            let rider = findTokenById(mount.getFlag('mountup', 'rider'));
            Chatter.dismountMessage(rider.data._id, data._id);
            await mount.unsetFlag(flagScope, flag.Rider);
            await rider.unsetFlag(flagScope, flag.Mount);
            await rider.unsetFlag(flagScope, flag.OrigSize);
            return true;
        }

        let targets = canvas.tokens.controlled;

        if (targets.length === 0) {
            warn("Please select the token to be the rider first.");
            return false;
        } else if (targets.length > 1) {
            warn("Only one rider per mount please. (for now)");
            return false;
        } else if (targets[0].id == data._id) {
            warn("You can't mount yourself.");
            return false;
        } else {
            let target = targets[0];
            let rider = findTokenById(target.id);
            let mount = findTokenById(data._id);

            await mount.setFlag(flagScope, flag.Rider, rider.id);
            await rider.setFlag(flagScope, flag.Mount, mount.id);
            await rider.setFlag(flagScope, flag.OrigSize, { w: rider.w, h: rider.h });

            this.moveRiderToMount(rider, mount);
            Chatter.mountMessage(target.id, data._id);
            return true;
        }
    }

    /**
     * Restores the size of a mount's rider token to original size
     * @param {String} mountId - The ID of the mount whose rider needs to be restored
     */
    static async restoreRiderSize(mountId) {
        let mount = findTokenById(mountId);
        let rider = findTokenById(mount.getFlag(flagScope, flag.Rider));
        let origsize = rider.getFlag(flagScope, flag.OrigSize);

        if (rider.w < origsize.w || rider.h < origsize.h) {
            let grid = canvas.scene.data.grid;
            let newWidth = rider.w < origsize.w ? origsize.w : rider.w;
            let newHeight = rider.h < origsize.h ? origsize.h : rider.H;

            await rider.update({
                width: newWidth / grid,
                height: newHeight / grid
            });
        }

        await rider.update({
            x: mount.x,
            y: mount.y,
        });

        rider.parent.sortChildren();
    }

    /**
     * Called when a token is deleted, checks if the token is part of any ride link, and breaks said link
     * @param {Object} token - The token being deleted
     */
    static async handleTokenDelete(tokenId) {
        let token = findTokenById(tokenId);

        if (this.isaRider(token.id)) {
            let mount = findTokenById(token.getFlag(flagScope, flag.Mount));
            await mount.unsetFlag(flagScope, flag.Rider);
        }

        if (this.isaMount(token.id)) {
            let rider = findTokenById(token.getFlag(flagScope, flag.Rider));
            await rider.unsetFlag(flagScope, flag.Mount);
            await rider.unsetFlag(flagScope, flag.OrigSize);
        }

        return true;
    }

    static popAllRiders() {
        canvas.tokens.placeables.forEach((token) => {
            if (this.isaMount(token.id) && !this.isaRider(token.id)) {
                this.popRider(token.id);
            }
        });
    }

    static async popRider(mountId) {
        let mount = findTokenById(mountId);
        let rider = findTokenById(mount.getFlag('mountup', 'rider'));

        if (rider) {
            rider.zIndex = mount.zIndex + 10;
        }

        if (this.isaMount(rider.id)) {
            this.popRider(rider.id);
        }

        mount.parent.sortChildren();
    }

    /**
     * Called when a token is moved in the game.
     * Determines if the token being moved is a mount - if it is, moves the rider to match
     * @param {String} tokenId - The ID of the token being moved
     * @param {Object} updateData - Update data being sent by the game
     */
    static async handleTokenMovement(tokenId, updateData) {
        //let links = RideLinks.get();

        if (this.isaMount(tokenId)) {
            //let ride = links[tokenId];
            let mount = findTokenById(tokenId);
            // A mount moved, make the rider follow
            let rider = findTokenById(mount.getFlag('mountup', 'rider'));

            await this.moveRiderToMount(rider, mount, updateData.x, updateData.y);
        }
    }

    /**
     * Returns true if the token is currently serving as a mount in any existing ride link
     * @param {String} tokenId - The ID of the token to evaluate
     */
    static isaMount(tokenId) {
        let token = findTokenById(tokenId);
        if (token) {
            return token.getFlag('mountup', 'rider') != undefined;
        } else return false;
    }

    /**
     * Returns true if the token is currenty serving as a rider in any existing ride link
     * @param {String} tokenId - The ID of the token to evaluate
     */
    static isaRider(tokenId) {
        let token = findTokenById(tokenId);
        if (token) {
            return token.getFlag('mountup', 'mount') != undefined;
        } else return false;
    }

    static isRidersMount(riderId, mountId) {
        let rider = findTokenById(riderId);
        let mount = findTokenById(mountId);
        return (rider.getFlag(flagScope, flag.Mount) == mount.id);
    }

    /**
     * Moves the Rider token to Mount token.
     * If both tokens are being moved together, newX and newY must be provided, or rider 
     *  will end up at the Mount's starting location
     * @param {Object} rider - The rider
     * @param {Object} mount - The mount
     * @param {Number} newX - (optional) The new X-coordinate for the move
     * @param {Number} newY - (optional) The new Y-coordinate for the move
     */
    static async moveRiderToMount(rider, mount, newX = undefined, newY = undefined) {
        if (rider.w >= mount.w || rider.h >= mount.h) {
            let grid = canvas.scene.data.grid;
            let newWidth = (mount.w / 2) / grid;
            let newHeight = (mount.h / 2) / grid;
            await rider.update({
                width: newWidth,
                height: newHeight,
            });
            rider.zIndex = mount.zIndex + 10;
        }

        let mountCenter = mount.getCenter(newX == undefined ? mount.x : newX, newY == undefined ? mount.y : newY);

        await rider.update({
            x: mountCenter.x - (rider.w / 2),
            y: mountCenter.y - (rider.h / 2),
        });
        rider.zIndex = mount.zIndex + 10;

        rider.parent.sortChildren();
    }

    static isAncestor(childId, ancestorId) {
        if (this.isaRider(childId)) {
            let child = findTokenById(childId);
            let parent = findTokenById(child.getFlag(flagScope, flag.Mount));
            if (parent.id == ancestorId) return true;
            return this.isAncestor(parent.id, ancestorId);
        }
        return false;
    }
}
