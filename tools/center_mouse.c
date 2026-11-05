#include <ApplicationServices/ApplicationServices.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdbool.h>

int main(int argc, char *argv[]) {
    CGFloat x = 0.0, y = 0.0;
    bool targetSet = false;

    // Syntax options:
    // 1) ./center_mouse <x> <y>
    // 2) ./center_mouse <display_id> <x> <y>
    // 3) ./center_mouse <display_id>
    // 4) ./center_mouse

    if (argc >= 4) {
        // Coordinates passed with display_id: use exact target coordinates
        x = atof(argv[2]);
        y = atof(argv[3]);
        targetSet = true;
    } else if (argc == 3) {
        // Direct x and y coordinates
        x = atof(argv[1]);
        y = atof(argv[2]);
        targetSet = true;
    } else if (argc == 2) {
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
