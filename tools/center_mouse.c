#include <ApplicationServices/ApplicationServices.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdbool.h>

int main(int argc, char *argv[]) {
    CGFloat x = 0.0, y = 0.0;
    bool targetSet = false;

    // Syntax options:
    // 1) ./center_mouse <display_id> <x> <y>
    // 2) ./center_mouse <x> <y>
    // 3) ./center_mouse <display_id>
    // 4) ./center_mouse

    if (argc >= 4) {
        CGDirectDisplayID dID = (CGDirectDisplayID)atol(argv[1]);
        CGFloat reqX = atof(argv[2]);
        CGFloat reqY = atof(argv[3]);
        CGRect bounds = CGDisplayBounds(dID);

        if (bounds.size.width > 0 && bounds.size.height > 0) {
            // Verify if (reqX, reqY) is already in global virtual screen coordinates on this display
            if (reqX >= bounds.origin.x && reqX <= (bounds.origin.x + bounds.size.width) &&
                reqY >= bounds.origin.y && reqY <= (bounds.origin.y + bounds.size.height)) {
                x = reqX;
                y = reqY;
            } else if (reqX >= 0 && reqX <= bounds.size.width && reqY >= 0 && reqY <= bounds.size.height) {
                // If coordinates were measured relative to this display's origin (0 to width)
                x = bounds.origin.x + reqX;
                y = bounds.origin.y + reqY;
            } else {
                // Center of the requested display
                x = bounds.origin.x + (bounds.size.width / 2.0);
                y = bounds.origin.y + (bounds.size.height / 2.0);
            }
            targetSet = true;
        }
    }

    if (!targetSet && argc == 3) {
        x = atof(argv[1]);
        y = atof(argv[2]);
        targetSet = true;
    } else if (!targetSet && argc == 2) {
        CGDirectDisplayID dID = (CGDirectDisplayID)atol(argv[1]);
        CGRect bounds = CGDisplayBounds(dID);
        if (bounds.size.width > 0 && bounds.size.height > 0) {
            x = bounds.origin.x + (bounds.size.width / 2.0);
            y = bounds.origin.y + (bounds.size.height / 2.0);
            targetSet = true;
        }
    }

    if (!targetSet) {
        CGDirectDisplayID mainDisplay = CGMainDisplayID();
        CGRect bounds = CGDisplayBounds(mainDisplay);
        x = bounds.origin.x + (bounds.size.width / 2.0);
        y = bounds.origin.y + (bounds.size.height / 2.0);
    }

    CGPoint target = CGPointMake(x, y);
    CGWarpMouseCursorPosition(target);
    CGAssociateMouseAndMouseCursorPosition(true);
    return 0;
}
