#include <ApplicationServices/ApplicationServices.h>
#include <stdlib.h>
#include <stdio.h>

int main(int argc, char *argv[]) {
    CGFloat x, y;
    if (argc >= 3) {
        x = atof(argv[1]);
        y = atof(argv[2]);
    } else {
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
