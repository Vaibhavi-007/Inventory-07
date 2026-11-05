#include <ApplicationServices/ApplicationServices.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdbool.h>
#include <string.h>

// Instantly warp the cursor position with zero delta, eliminating any motion trails or animation
static inline void warp_cursor_instant(CGFloat x, CGFloat y) {
    CGPoint pt = CGPointMake(x, y);

    // 1. Immediately warp the hardware pointer position
    CGDisplayMoveCursorToPoint(CGMainDisplayID(), pt);
    CGWarpMouseCursorPosition(pt);
    CGAssociateMouseAndMouseCursorPosition(true);

    // 2. Synthesize an instantaneous mouse moved event with zero delta
    // This immediately syncs macOS WindowServer and browser without any trail or interpolation
    CGEventRef moveEv = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved, pt, kCGMouseButtonLeft);
    if (moveEv) {
        CGEventSetIntegerValueField(moveEv, kCGMouseEventDeltaX, 0);
        CGEventSetIntegerValueField(moveEv, kCGMouseEventDeltaY, 0);
        CGEventPost(kCGHIDEventTap, moveEv);
        CFRelease(moveEv);
    }
}

int main(int argc, char *argv[]) {
    // Daemon pipe mode for sub-millisecond persistent stdin warping:
    // ./center_mouse --daemon
    if (argc >= 2 && strcmp(argv[1], "--daemon") == 0) {
        setvbuf(stdin, NULL, _IOLBF, 0);
        setvbuf(stdout, NULL, _IOLBF, 0);
        char line[256];
        while (fgets(line, sizeof(line), stdin)) {
            double rx = 0.0, ry = 0.0;
            if (sscanf(line, "%lf %lf", &rx, &ry) == 2) {
                warp_cursor_instant((CGFloat)rx, (CGFloat)ry);
                printf("OK %.1f %.1f\n", rx, ry);
                fflush(stdout);
            }
        }
        return 0;
    }

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

    warp_cursor_instant(x, y);
    return 0;
}
